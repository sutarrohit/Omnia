# Multi-Bot Channel Connections — Implementation Plan

**Goal:** A user pastes a Telegram **bot token** in the frontend; the backend validates it, stores it (encrypted), registers its webhook, and starts ingesting messages — **per bot**. Support **many Telegram bots at once**, and structure the code so a new channel (WhatsApp, Discord, …) is **plug-and-play**: write one provider class, register it, done.

**Decisions locked in (from requirements):**
- **Multi-tenant via real auth** — every bot belongs to an `Organization`. Auth is handled by **better-auth** with its **organization plugin**: a signed-in user has an active organization, and the tenant is resolved from the **session** (no placeholder header). Better-auth owns `User`/`Session`/`Account`/`Verification` and the org plugin owns `Organization`/`Member`/`Invitation`.
- **Telegram only** is implemented now, but the adapter layer is generalized so other channels just plug in.
- **Tokens encrypted at rest** (AES-256-GCM, key from env).
- **Fully migrate off env** — `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` are removed; all bot credentials live in the DB. `PUBLIC_URL` stays as the webhook base URL.

> **Naming note:** better-auth ships its own `Account` model (linked credential/OAuth records). To avoid a collision, the **tenant is `Organization`** (from the org plugin), not `Account`. Everywhere this plan scopes data to a tenant it uses `organizationId`.

> **Version note:** the better-auth specifics below were **verified against the live docs** (better-auth docs MCP, 2026-06-02): the Hono mount, `auth.api.getSession`, the `session.create.before` active-org hook, the org-plugin install/client imports, and the `member`/`organization` field names all match. Re-verify only if you bump the better-auth major.

---

## 0. The core problem with today's design

| Today (single bot) | Needed (multi bot) |
|---|---|
| `ChannelRegistry` maps **one** adapter per `Platform` | Resolve an adapter **per connection** (per bot) |
| `TelegramAdapter` built once at startup from `env` | Built on demand from a **stored, decrypted** connection |
| Webhook route `/webhooks/:channel` → the one adapter | `/webhooks/:channel/:connectionId` → that bot's adapter |
| `ChannelIdentity @@unique([channel, channelUserId])` (global) | `@@unique([connectionId, channelUserId])` (per bot) |
| `Conversation.channel` only; reply uses `registry.get(channel)` | `Conversation.connectionId`; reply uses that bot's token |
| Credentials in `.env` | Credentials in DB, org-scoped, encrypted |
| No auth; no tenant | better-auth session → active `Organization` scopes everything |

The key refactor is splitting **per-platform capability** (how to talk to Telegram) from **per-connection credentials** (which bot). We introduce a `ChannelProvider` (one per platform, registered once) that *manufactures* a per-connection `ChannelAdapter`.

---

## 1. New architecture at a glance

```
Frontend (signed in via better-auth, active org set)
        │  POST /api/v1/connections { platform, token }   [session cookie]
        ▼
auth middleware: session → activeOrganizationId → c.var.organizationId
        ▼
ConnectionService.create(organizationId, platform, token)
        │  provider.validateCredentials(token)  → getMe (bot id + username)
        │  generate webhookSecret, encrypt(token)
        │  persist ChannelConnection (org-scoped)
        │  provider.registerWebhook(ctx, `${PUBLIC_URL}/webhooks/telegram/${id}`)
        ▼
Telegram delivers updates → POST /webhooks/telegram/:connectionId   [NO auth — secured by per-connection secret]
        │  load connection → decrypt → provider.adapter(ctx)
        │  verifyWebhook (secret) → parseInbound → ingest(msg, connectionCtx)
        ▼
Conversation + Message rows (scoped to org + connection)
```

```
src/
  auth.ts                         # NEW better-auth instance (prisma adapter + organization plugin)
  channels/
    types.ts                      # + ConnectionContext (incl. organizationId)
    channel-adapter.ts            # unchanged contract (per-connection instance)
    channel-provider.ts           # NEW abstract: validate / build adapter / (un)register webhook
    provider-registry.ts          # NEW Map<Platform, ChannelProvider> (replaces channel-registry)
    index.ts                      # buildProviderRegistry() — register every provider once
    telegram/
      telegram-provider.ts        # NEW
      telegram-adapter.ts         # mostly unchanged (token+secret already ctor args)
      telegram.types.ts           # unchanged
  middlewares/
    auth.ts                       # NEW session → c.var.user + c.var.organizationId
```

---

## 2. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| **1** | **better-auth** server instance (prisma adapter + email/password + organization plugin), mounted on Hono; generate auth schema; web auth client + sign-in/up | Sign up → an `Organization` + `Member` is created and active; session cookie set |
| **2** | Schema: `ChannelConnection`, scope `Customer`/`ChannelIdentity`/`Conversation` to `Organization`; `ConnectionStatus` enum; migrate | `db:migrate` applies; tables visible in Prisma Studio |
| **3** | Crypto util + env changes (`APP_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, drop Telegram vars) | Encrypt→decrypt round-trips in a unit test |
| **4** | `ChannelProvider` + `ProviderRegistry`; `TelegramProvider`; per-connection `TelegramAdapter` | Registry resolves a Telegram provider; adapter builds from a context |
| **5** | `ConnectionService` (create/list/delete + webhook (un)register) | `create()` validates token, stores encrypted, sets webhook (fetch mocked in test) |
| **6** | Connection-aware webhook route `/webhooks/:channel/:connectionId` | Real message to a registered bot lands in DB under the right connection |
| **7** | Org-scoped ingest + reply (connection-aware) | Reply goes out via the correct bot's token |
| **8** | `connections/` OpenAPI feature route (POST/GET/DELETE) + auth middleware | Endpoints work for a signed-in user; org resolved from session |
| **9** | Frontend: sign-in/up, add-bot form, bot list, delete | User signs in, pastes a token in the UI, and the bot goes live |

---

## 3. Phase 1 — better-auth

### `src/auth.ts` — NEW
```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "./lib/prisma.js";
import env from "./env.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,            // e.g. http://localhost:4000
  trustedOrigins: [env.FRONTEND_URL],
  emailAndPassword: { enabled: true },
  plugins: [organization()],
  databaseHooks: {
    // Give every new user a personal org so there's always a tenant.
    user: {
      create: {
        after: async (user) => {
          const org = await prisma.organization.create({
            data: { name: `${user.name ?? user.email}'s workspace`, slug: user.id },
          });
          await prisma.member.create({
            data: { organizationId: org.id, userId: user.id, role: "owner" },
          });
        },
      },
    },
    // Default the active org to the user's first membership on each new session.
    session: {
      create: {
        before: async (session) => {
          const member = await prisma.member.findFirst({ where: { userId: session.userId } });
          return { data: { ...session, activeOrganizationId: member?.organizationId } };
        },
      },
    },
  },
});

export type Auth = typeof auth;
```
> **Verified (and corrected) against a running build:** `databaseHooks` supports `user`/`session`/`account` with `before`/`after`; `session.create.before` returning `{ data: { ...session, activeOrganizationId } }` is the official pattern for defaulting the active org. `member` fields are `userId`/`organizationId`/`role`; default creator role is `"owner"`. Creating the org + member directly via Prisma in the hook (rather than `auth.api.createOrganization`, which needs a session) is fine — but the generated `Organization`/`Member` models have **no DB default** on `id`/`createdAt`, so the hook must supply both (`randomUUID()` / `new Date()`).
>
> ⚠️ **Ordering caveat (measured):** during **sign-up**, better-auth creates the session *before* the `user.create.after` hook finishes — so at the first session's `session.create.before`, the `Member` row doesn't exist yet and `activeOrganizationId` ends up **null**. The hook works correctly on every subsequent **sign-in** (member exists by then). The first-session gap is exactly what the Phase 8 middleware fallback (`activeOrganizationId ?? user's first Member`) covers — that fallback is **load-bearing for the first session**, not just a safety net.

### Mount on Hono (`src/app.ts`)
Mount the better-auth handler **before** the `/api/v1` routes, and **outside** the OpenAPI router (it's not a zod-openapi route):
```ts
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```
CORS already allows credentials (`create-app.ts`), which better-auth's cookies need — keep `origin: FRONTEND_URL`, `credentials: true`.

### Generate the auth schema
better-auth (+ org plugin) owns these models: `User`, `Session`, `Account`, `Verification`, `Organization`, `Member`, `Invitation` (the org plugin also adds `activeOrganizationId` to `Session`). Generate them into `prisma/schema.prisma` with **`npx @better-auth/cli@latest generate`** (the bin is also aliased as `npx auth generate`), then apply with Prisma's own **`pnpm db:migrate`**.

> ⚠️ better-auth's own `migrate` command works **only** with its built-in Kysely adapter — **not Prisma**. With the Prisma adapter you always use `generate` (which writes the Prisma models) and then run the normal Prisma migration. Don't run `npx auth migrate`.

We add relation fields to the generated `Organization` model in Phase 2 (`connections`, `customers`) and keep them in sync with the generated models.

### Web auth client (`apps/web`)
```ts
// lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,   // http://localhost:4000
  plugins: [organizationClient()],
});
```
Add minimal sign-up / sign-in pages using `authClient.signUp.email` / `authClient.signIn.email`. (Full UI polish lives in Phase 9.)

---

## 4. Phase 2 — Schema (`prisma/schema.prisma`)

The auth models (`User`/`Session`/`Account`/`Verification`/`Organization`/`Member`/`Invitation`) are generated in Phase 1. Here we add the app models and scope them to `Organization`. Add the back-relations to the **generated** `Organization` model (`connections`, `customers`).

```prisma
// --- add to the generated Organization model ---
//   connections ChannelConnection[]
//   customers   Customer[]

model ChannelConnection {
  id             String           @id @default(uuid())
  organization   Organization     @relation(fields: [organizationId], references: [id])
  organizationId String
  platform       Platform
  externalId     String           // bot's own id from the provider (Telegram numeric id)
  displayName    String?          // bot username / title, for the UI
  encryptedToken String           // AES-256-GCM packed (iv:tag:ciphertext, base64)
  webhookSecret  String           // per-connection random secret
  status         ConnectionStatus @default(ACTIVE)
  meta           Json?            // platform-specific extras (plug-and-play room)
  identities     ChannelIdentity[]
  conversations  Conversation[]
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@unique([platform, externalId])   // same bot can't be added twice (global — see §13)
  @@index([organizationId])
}

model Customer {
  id             String            @id @default(uuid())
  organization   Organization      @relation(fields: [organizationId], references: [id])
  organizationId String
  displayName    String?
  identities     ChannelIdentity[]
  conversations  Conversation[]
  createdAt      DateTime          @default(now())

  @@index([organizationId])
}

model ChannelIdentity {
  id            String            @id @default(uuid())
  customer      Customer          @relation(fields: [customerId], references: [id])
  customerId    String
  connection    ChannelConnection @relation(fields: [connectionId], references: [id])
  connectionId  String
  channel       Platform          // denormalized for convenience
  channelUserId String
  createdAt     DateTime          @default(now())

  @@unique([connectionId, channelUserId])   // per-bot identity (was [channel, channelUserId])
  @@index([customerId])
}

model Conversation {
  id              String             @id @default(uuid())
  organization    Organization       @relation(fields: [organizationId], references: [id])
  organizationId  String
  customer        Customer           @relation(fields: [customerId], references: [id])
  customerId      String
  connection      ChannelConnection  @relation(fields: [connectionId], references: [id])
  connectionId    String
  channel         Platform
  status          ConversationStatus @default(OPEN)
  assignedAgentId String?
  lastMessageAt   DateTime?
  messages        Message[]
  createdAt       DateTime           @default(now())

  @@index([connectionId, status])
  @@index([organizationId, status])
  @@index([assignedAgentId])
}

enum ConnectionStatus {
  ACTIVE
  DISABLED
  ERROR
}
```

> `Message` is unchanged (keyed by conversation).

**Migration note:** these add **required** columns to existing tables. Assuming pre-production, do a clean migrate (`db:migrate`, accept reset if prompted) and reseed. If real data exists, that's a separate backfill task — flag before running. **Dev story changes:** there's no placeholder org id anymore — sign up via the UI (the `user.create` hook makes an `Organization` + `Member`). `db:seed` should create a demo `Customer`/`Conversation` only **after** an org exists, or be invoked with a known `organizationId`; keep seed data org-scoped.

---

## 5. Phase 3 — Crypto + env

### `src/lib/crypto.ts`
AES-256-GCM with a 32-byte key from env (base64). `encrypt(plain) → "iv:tag:ciphertext"` (base64 parts); `decrypt(packed) → plain`. Use Node `crypto` (`randomBytes`, `createCipheriv`/`createDecipheriv`).

### `src/env.ts`
- **Remove** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
- **Add** `APP_ENCRYPTION_KEY: z.string()` (validate it decodes to 32 bytes).
- **Add** `BETTER_AUTH_SECRET: z.string().min(32)` and `BETTER_AUTH_URL: z.url()` (server's own base URL).
- Keep `PUBLIC_URL`, `FRONTEND_URL`, `DATABASE_URL`, `DIRECT_URL`.
- Update `.env.example` and `.env.test` (generate a test encryption key + auth secret); drop the removed vars there too.

---

## 6. Phase 4 — Provider abstraction (plug-and-play core)

### `src/channels/types.ts` — add
```ts
export interface ConnectionContext {
  id: string;            // ChannelConnection.id
  organizationId: string;
  platform: Platform;
  externalId: string;
  token: string;         // DECRYPTED — only in memory
  webhookSecret: string;
  meta?: unknown;
}
```

### `src/channels/channel-provider.ts` — NEW
```ts
export abstract class ChannelProvider {
  abstract readonly platform: Platform;

  /** Validate a raw credential from the frontend; return identity for storage. */
  abstract validateCredentials(raw: { token: string }): Promise<{
    externalId: string;
    displayName?: string;
  }>;

  /** Build a per-connection adapter (verify/parse/send) from a stored context. */
  abstract adapter(ctx: ConnectionContext): ChannelAdapter;

  /** Point the provider at our webhook URL (called on connection create). */
  abstract registerWebhook(ctx: ConnectionContext, webhookUrl: string): Promise<void>;

  /** Detach the webhook (called on delete/disable). */
  abstract unregisterWebhook(ctx: ConnectionContext): Promise<void>;
}
```

### `src/channels/provider-registry.ts` — NEW (replaces `channel-registry.ts`)
`Map<Platform, ChannelProvider>` with `register` / `get(platform)` / `has(platform)`. **One provider per platform** (correct — capability is per-platform); the *instances* (bots) are the DB rows.

### `src/channels/telegram/telegram-provider.ts` — NEW
```ts
export class TelegramProvider extends ChannelProvider {
  readonly platform = Platform.TELEGRAM;

  async validateCredentials({ token }) {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (!data.ok) throw new BadRequest("Invalid Telegram bot token");
    return { externalId: String(data.result.id), displayName: data.result.username };
  }

  adapter(ctx: ConnectionContext) {
    return new TelegramAdapter(ctx.token, ctx.webhookSecret);
  }

  async registerWebhook(ctx, webhookUrl) {
    const res = await fetch(`https://api.telegram.org/bot${ctx.token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: ctx.webhookSecret }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`setWebhook failed: ${data.description}`);
  }

  async unregisterWebhook(ctx) {
    await fetch(`https://api.telegram.org/bot${ctx.token}/deleteWebhook`, { method: "POST" });
  }
}
```

`TelegramAdapter` stays **almost identical** — it already takes `(botToken, webhookSecret)` in its constructor; we just construct it per connection instead of once from env. `parseInbound` / `verifyWebhook` / `sendMessage` unchanged. Confirm `verifyWebhook` reads Telegram's `X-Telegram-Bot-Api-Secret-Token` header (compared to `ctx.webhookSecret`), not anything env-derived.

### `src/channels/index.ts`
```ts
export function buildProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new TelegramProvider());
  // registry.register(new WhatsAppProvider());  // <- the entire cost of a new channel
  return registry;
}
```

> **Plug-and-play payoff:** a new channel = one `XProvider` + one `XAdapter` + one `register(...)` line. Routes, services, DB, and the reply path are untouched.

---

## 7. Phase 5 — `ConnectionService`

`src/services/connection.service.ts` — depends on `prisma` + `ProviderRegistry`.

- `toContext(conn) → ConnectionContext` — decrypts `encryptedToken` (carries `organizationId`).
- `create(organizationId, platform, rawToken)`:
  1. `provider = registry.get(platform)`
  2. `{ externalId, displayName } = await provider.validateCredentials({ token: rawToken })`
  3. Reject if `[platform, externalId]` already exists (bot already connected).
  4. `webhookSecret = randomBytes(24).toString("hex")`; `encryptedToken = encrypt(rawToken)`.
  5. Create the `ChannelConnection` row (with `organizationId`).
  6. `provider.registerWebhook(ctx, \`${env.PUBLIC_URL}/webhooks/${platform.toLowerCase()}/${conn.id}\`)`.
  7. **On webhook failure → delete the row and throw**, surfacing the provider error to the UI. (A connection that never registered isn't a connection; cleaner than leaving an `ERROR` ghost the user must reap. Reserve `status: ERROR` for a *previously healthy* bot that later fails.)
- `list(organizationId)` — return safe fields only (**never** the token/secret).
- `get(organizationId, id)` — scoped to org.
- `remove(organizationId, id)` — `unregisterWebhook` then delete (or soft-disable).

Wire into `src/lib/container.ts`: replace `buildChannelRegistry()` with `buildProviderRegistry()`, export `providerRegistry` and `connectionService`.

---

## 8. Phase 6 — Connection-aware webhook route

The webhook route is **public** (Telegram calls it) — the auth middleware does **not** apply here; the per-connection `webhookSecret` is the security boundary.

- `src/routes/webhooks/index.ts`: `webhooksRouter.post("/:channel/:connectionId", handleWebhook)`.
- `src/routes/webhooks/webhooks.handler.ts`:
  1. `channel = toPlatform(param)`; `404` if unknown or `!providerRegistry.has(channel)`.
  2. Load `connection` by `connectionId` (and assert `platform === channel`, `status === ACTIVE`); `404`/`410` otherwise.
  3. `ctx = connectionService.toContext(connection)`; `adapter = providerRegistry.get(channel).adapter(ctx)`.
  4. `adapter.verifyWebhook(...)` → `403` on bad secret.
  5. `for (msg of adapter.parseInbound(body)) await ingestService.ingest(msg, ctx)`.
  6. Always ack `200` (avoid retry storms), log errors via `c.var.logger`.
- Delete the now-obsolete `scripts/set-telegram-webhook.ts` (registration is done by `ConnectionService.create`).

---

## 9. Phase 7 — Org-scoped ingest + connection-aware reply

- **`NormalizedInboundMessage`** stays channel-agnostic; ingest takes the `ConnectionContext` as a second arg.
- **`CustomerService.resolve(organizationId, connectionId, channelUserId, displayName?)`** — identity lookup keyed by `connectionId_channelUserId`; create `Customer` with `organizationId` and the identity with `connectionId`.
- **`ConversationService.findOrCreateOpen(organizationId, customerId, connectionId, channel)`** — scope the open-conversation lookup by `connectionId`.
- **`ConversationService.list`** — accept `organizationId` (and optional `connectionId`) filter, so the inbox is per tenant/bot.
- **`IngestService.ingest(msg, ctx)`** — thread `ctx.organizationId`/`ctx.id` through resolve + findOrCreateOpen.
- **`ReplyService.reply(conversationId, content)`** — load conversation **with its `connectionId`**; build the adapter from that connection's context (`connectionService.toContext`) instead of `registry.get(channel)`; send via the correct bot's token. Identity lookup uses `connectionId`.

---

## 10. Phase 8 — `connections/` API route + auth context

- **Auth middleware** (`src/middlewares/auth.ts`):
  1. `const res = await auth.api.getSession({ headers: c.req.raw.headers })` — returns `{ user, session } | null`; `401` if null.
  2. `organizationId = res.session.activeOrganizationId` (the org plugin puts it on the `session` row; the `session.create.before` hook in Phase 1 already defaults it — fall back to the user's first `Member` only as a safety net); `403` if the user has no org.
  3. Set `c.var.user = res.user` and `c.var.organizationId = organizationId`.
  - Add to `AppBinding["Variables"]` (`src/lib/types.ts`): `user: typeof auth.$Infer.Session.user` and `organizationId: string` (use better-auth's `$Infer.Session` so the types track the auth config).
  - Apply to `/api/v1/connections` and `/api/v1/conversations` (NOT `/webhooks`, NOT `/api/auth`).
- **`src/routes/connections/`** (zod-openapi, mirrors `conversations/`):
  - `POST /api/v1/connections` — body `{ platform: PlatformEnum, token: string }` → `connectionService.create(c.var.organizationId, platform, token)` → `201 { id, platform, displayName, status }`.
  - `GET /api/v1/connections` — list for the org (safe fields).
  - `DELETE /api/v1/connections/{id}` — remove (org-scoped).
- Mount in `src/app.ts`: `app.route("/api/v1/connections", connectionsRouter)`.

---

## 11. Phase 9 — Frontend (Next.js, `apps/web`)

> Read `node_modules/next/dist/docs/` first per `apps/web/AGENTS.md`.

- **`lib/auth-client.ts`**: better-auth React client (see Phase 1). Sign-up / sign-in / sign-out pages; gate the app behind a session (redirect to sign-in when `useSession()` is empty).
- **`utils/request.ts`**: send cookies with every API call (`credentials: "include"`) so the session rides along — **replaces** any `x-account-id` header idea. No tenant header needed; the server derives the org from the session.
- **`lib/api/connections/connection-apis.ts`**: `createConnection({ platform, token })`, `listConnections()`, `deleteConnection(id)`.
- **`lib/api/connections/connection-queries.ts`**: react-query query/mutation options (mirror `user-queries.ts`).
- **UI** (a `/connections` route or section): a form to paste a Telegram token + submit (shows validation/setWebhook errors from the API), a list of connected bots (displayName, status badge), and a delete action. Use the existing shadcn `button`/`card`.

---

## 12. Tests (Vitest, `apps/server`)

- `crypto.test.ts` — encrypt→decrypt round-trip; tamper detection.
- `telegram-provider.test.ts` — mock `fetch`: `validateCredentials` parses `getMe`; `registerWebhook` posts the right URL+secret; bad token throws.
- `connection.service.test.ts` — `create` stores encrypted token (not plaintext), generates a secret, calls `registerWebhook`; webhook failure deletes the row + throws; duplicate `[platform, externalId]` rejected.
- `auth-middleware.test.ts` — `401` with no session; resolves `organizationId` from a mocked session; `403` when the user has no org. Mock `auth.api.getSession`.
- `webhooks.handler.test.ts` — **update** for the new `/:channel/:connectionId` path: 404 unknown connection, 403 wrong secret, 200 verified-but-no-message. Confirm it's reachable **without** a session. Seed a connection row in the test DB / mock the lookup.
- `telegram-adapter.test.ts` — unchanged (`parseInbound`).

---

## 13. File-change checklist

**New**
- `src/auth.ts` (better-auth instance + org plugin)
- `prisma/` migration (auth models via CLI, then ChannelConnection + org scoping cols + ConnectionStatus)
- `src/lib/crypto.ts`
- `src/channels/channel-provider.ts`, `src/channels/provider-registry.ts`
- `src/channels/telegram/telegram-provider.ts`
- `src/services/connection.service.ts`
- `src/routes/connections/{connections.route.ts,connections.handler.ts,index.ts}`
- `src/middlewares/auth.ts`
- `apps/web/lib/auth-client.ts`, sign-in/up pages, `apps/web/lib/api/connections/*`, connections UI

**Modified**
- `src/env.ts` (drop Telegram vars; add `APP_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), `.env.example`, `.env.test`
- `prisma/schema.prisma` (auth models + ChannelConnection + org scoping), `prisma/seed` (org-scoped demo data)
- `src/channels/index.ts` (`buildProviderRegistry`), `src/channels/types.ts` (`ConnectionContext` w/ `organizationId`)
- `src/channels/telegram/telegram-adapter.ts` (only if any env coupling remains — currently none)
- `src/lib/container.ts` (registry + `connectionService`), `src/lib/types.ts` (`AppBinding` vars: `user`, `organizationId`)
- `src/app.ts` (mount better-auth handler + connections route; apply auth middleware)
- `src/routes/webhooks/{index.ts,webhooks.handler.ts}`
- `src/services/{customer,conversation,ingest,reply}.service.ts` (org/connection scoping)
- `apps/web/utils/request.ts` (`credentials: "include"`)
- `src/routes/webhooks/webhooks.handler.test.ts`

**Removed**
- `scripts/set-telegram-webhook.ts`
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` from env + `.env*`
- `src/channels/channel-registry.ts` (superseded by `provider-registry.ts`)

---

## 14. Open follow-ups (not in this plan)

- **Org switching / invites UI** — the org plugin supports multiple orgs per user, member roles, and invitations; this plan only auto-creates a personal org and resolves the active one. Surface switching/inviting later if needed.
- **Secret rotation / key rotation** for `APP_ENCRYPTION_KEY` (versioned key id in the packed token — cheap to add a `v1:` prefix to the crypto format now).
- **Webhook hardening at scale** — a persistent host can process inline for now (per `MEMORY.md`, deployment is Docker on a persistent host, so in-process WS/SSE + inline webhook handling is fine). If volume grows, move ingest to a queue + worker.
- **Media handling** — Telegram `file_id` → object storage.
