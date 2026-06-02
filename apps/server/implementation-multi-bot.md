# Multi-Bot Channel Connections — Implementation Plan

**Goal:** A user pastes a Telegram **bot token** in the frontend; the backend validates it, stores it (encrypted), registers its webhook, and starts ingesting messages — **per bot**. Support **many Telegram bots at once**, and structure the code so a new channel (WhatsApp, Discord, …) is **plug-and-play**: write one provider class, register it, done.

**Decisions locked in (from requirements):**
- **Multi-tenant** — every bot belongs to an `Account`. (Full auth is out of scope; we resolve the account from an `x-account-id` header for now and flag where real auth slots in.)
- **Telegram only** is implemented now, but the adapter layer is generalized so other channels just plug in.
- **Tokens encrypted at rest** (AES-256-GCM, key from env).
- **Fully migrate off env** — `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` are removed; all bot credentials live in the DB. `PUBLIC_URL` stays as the webhook base URL.

---

## 0. The core problem with today's design

| Today (single bot) | Needed (multi bot) |
|---|---|
| `ChannelRegistry` maps **one** adapter per `Platform` | Resolve an adapter **per connection** (per bot) |
| `TelegramAdapter` built once at startup from `env` | Built on demand from a **stored, decrypted** connection |
| Webhook route `/webhooks/:channel` → the one adapter | `/webhooks/:channel/:connectionId` → that bot's adapter |
| `ChannelIdentity @@unique([channel, channelUserId])` (global) | `@@unique([connectionId, channelUserId])` (per bot) |
| `Conversation.channel` only; reply uses `registry.get(channel)` | `Conversation.connectionId`; reply uses that bot's token |
| Credentials in `.env` | Credentials in DB, account-scoped, encrypted |

The key refactor is splitting **per-platform capability** (how to talk to Telegram) from **per-connection credentials** (which bot). We introduce a `ChannelProvider` (one per platform, registered once) that *manufactures* a per-connection `ChannelAdapter`.

---

## 1. New architecture at a glance

```
Frontend (paste token)
        │  POST /api/v1/connections { platform, token }   [x-account-id header]
        ▼
ConnectionService.create()
        │  provider.validateCredentials(token)  → getMe (bot id + username)
        │  generate webhookSecret, encrypt(token)
        │  persist ChannelConnection (account-scoped)
        │  provider.registerWebhook(ctx, `${PUBLIC_URL}/webhooks/telegram/${id}`)
        ▼
Telegram delivers updates → POST /webhooks/telegram/:connectionId
        │  load connection → decrypt → provider.adapter(ctx)
        │  verifyWebhook (secret) → parseInbound → ingest(msg, connectionCtx)
        ▼
Conversation + Message rows (scoped to account + connection)
```

```
src/channels/
  types.ts                      # + ConnectionContext
  channel-adapter.ts            # unchanged contract (per-connection instance)
  channel-provider.ts           # NEW abstract: validate / build adapter / (un)register webhook
  provider-registry.ts          # NEW Map<Platform, ChannelProvider> (replaces channel-registry)
  index.ts                      # buildProviderRegistry() — register every provider once
  telegram/
    telegram-provider.ts        # NEW
    telegram-adapter.ts         # mostly unchanged (token+secret already ctor args)
    telegram.types.ts           # unchanged
```

---

## 2. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| **1** | Schema: `Account`, `ChannelConnection`, scope `Customer`/`ChannelIdentity`/`Conversation`; `ConnectionStatus` enum; migrate | `db:migrate` applies; tables visible in Prisma Studio |
| **2** | Crypto util + env changes (`APP_ENCRYPTION_KEY`, drop Telegram vars) | Encrypt→decrypt round-trips in a unit test |
| **3** | `ChannelProvider` + `ProviderRegistry`; `TelegramProvider`; per-connection `TelegramAdapter` | Registry resolves a Telegram provider; adapter builds from a context |
| **4** | `ConnectionService` (create/list/delete + webhook (un)register) | `create()` validates token, stores encrypted, sets webhook (fetch mocked in test) |
| **5** | Connection-aware webhook route `/webhooks/:channel/:connectionId` | Real message to a registered bot lands in DB under the right connection |
| **6** | Account-scope ingest + reply (connection-aware) | Reply goes out via the correct bot's token |
| **7** | `connections/` OpenAPI feature route (POST/GET/DELETE) + account middleware | Endpoints work in Swagger; account resolved from header |
| **8** | Frontend: add-bot form, bot list, delete | User pastes a token in the UI and the bot goes live |

---

## 3. Phase 1 — Schema (`prisma/schema.prisma`)

```prisma
model Account {
  id          String              @id @default(uuid())
  name        String
  connections ChannelConnection[]
  customers   Customer[]
  createdAt   DateTime            @default(now())
}

model ChannelConnection {
  id             String           @id @default(uuid())
  account        Account          @relation(fields: [accountId], references: [id])
  accountId      String
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

  @@unique([platform, externalId])   // same bot can't be added twice
  @@index([accountId])
}

model Customer {
  id            String            @id @default(uuid())
  account       Account           @relation(fields: [accountId], references: [id])
  accountId     String
  displayName   String?
  identities    ChannelIdentity[]
  conversations Conversation[]
  createdAt     DateTime          @default(now())

  @@index([accountId])
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
  account         Account            @relation(fields: [accountId], references: [id])
  accountId       String
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
  @@index([accountId, status])
  @@index([assignedAgentId])
}

enum ConnectionStatus {
  ACTIVE
  DISABLED
  ERROR
}
```

> `Message` is unchanged (keyed by conversation). `Account` needs a back-relation field on `Conversation`/`Customer` (shown above).

**Migration note:** these add **required** columns to existing tables. Assuming pre-production, do a clean migrate (`db:migrate`, accept reset if prompted) and reseed. If real data exists, that's a separate backfill task — flag before running. Update `db:seed` to create one default `Account` (its id is the placeholder `x-account-id` for dev).

---

## 4. Phase 2 — Crypto + env

### `src/lib/crypto.ts`
AES-256-GCM with a 32-byte key from env (base64). `encrypt(plain) → "iv:tag:ciphertext"` (base64 parts); `decrypt(packed) → plain`. Use Node `crypto` (`randomBytes`, `createCipheriv`/`createDecipheriv`).

### `src/env.ts`
- **Remove** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
- **Add** `APP_ENCRYPTION_KEY: z.string()` (validate it decodes to 32 bytes).
- Keep `PUBLIC_URL`.
- Update `.env.example` and `.env.test` (generate a test key); drop the removed vars there too.

---

## 5. Phase 3 — Provider abstraction (plug-and-play core)

### `src/channels/types.ts` — add
```ts
export interface ConnectionContext {
  id: string;            // ChannelConnection.id
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

`TelegramAdapter` stays **almost identical** — it already takes `(botToken, webhookSecret)` in its constructor; we just construct it per connection instead of once from env. `parseInbound` / `verifyWebhook` / `sendMessage` unchanged.

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

## 6. Phase 4 — `ConnectionService`

`src/services/connection.service.ts` — depends on `prisma` + `ProviderRegistry`.

- `toContext(conn) → ConnectionContext` — decrypts `encryptedToken`.
- `create(accountId, platform, rawToken)`:
  1. `provider = registry.get(platform)`
  2. `{ externalId, displayName } = await provider.validateCredentials({ token: rawToken })`
  3. Reject if `[platform, externalId]` already exists (bot already connected).
  4. `webhookSecret = randomBytes(24).toString("hex")`; `encryptedToken = encrypt(rawToken)`.
  5. Create the `ChannelConnection` row.
  6. `provider.registerWebhook(ctx, \`${env.PUBLIC_URL}/webhooks/${platform.toLowerCase()}/${conn.id}\`)`.
  7. On webhook failure → mark `status: ERROR` (or delete + throw). Surface the provider error to the UI.
- `list(accountId)` — return safe fields only (**never** the token/secret).
- `get(accountId, id)` — scoped to account.
- `remove(accountId, id)` — `unregisterWebhook` then delete (or soft-disable).

Wire into `src/lib/container.ts`: replace `buildChannelRegistry()` with `buildProviderRegistry()`, export `providerRegistry` and `connectionService`.

---

## 7. Phase 5 — Connection-aware webhook route

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

## 8. Phase 6 — Account-scoped ingest + connection-aware reply

- **`NormalizedInboundMessage`** stays channel-agnostic; ingest takes the `ConnectionContext` as a second arg.
- **`CustomerService.resolve(accountId, connectionId, channelUserId, displayName?)`** — identity lookup keyed by `connectionId_channelUserId`; create `Customer` with `accountId` and the identity with `connectionId`.
- **`ConversationService.findOrCreateOpen(accountId, customerId, connectionId, channel)`** — scope the open-conversation lookup by `connectionId`.
- **`ConversationService.list`** — accept `accountId` (and optional `connectionId`) filter, so the inbox is per tenant/bot.
- **`IngestService.ingest(msg, ctx)`** — thread `ctx.accountId`/`ctx.id` through resolve + findOrCreateOpen. (Add `accountId` to `ConnectionContext`.)
- **`ReplyService.reply(conversationId, content)`** — load conversation **with its `connectionId`**; build the adapter from that connection's context (`connectionService.toContext`) instead of `registry.get(channel)`; send via the correct bot's token. Identity lookup uses `connectionId`.

---

## 9. Phase 7 — `connections/` API route + account context

- **Account middleware** (`src/middlewares/account.ts`): read `x-account-id` header → set `c.var.accountId`; `401` if missing/unknown. *This is the seam where real auth replaces the header later.* Apply to `/api/v1/connections` and `/api/v1/conversations`.
- **`src/routes/connections/`** (zod-openapi, mirrors `conversations/`):
  - `POST /api/v1/connections` — body `{ platform: PlatformEnum, token: string }` → `connectionService.create(accountId, platform, token)` → `201 { id, platform, displayName, status }`.
  - `GET /api/v1/connections` — list for the account (safe fields).
  - `DELETE /api/v1/connections/{id}` — remove.
- Mount in `src/app.ts`: `app.route("/api/v1/connections", connectionsRouter)`.

---

## 10. Phase 8 — Frontend (Next.js, `apps/web`)

> Read `node_modules/next/dist/docs/` first per `apps/web/AGENTS.md`.

- **`utils/request.ts`**: send the `x-account-id` header (dev placeholder until auth).
- **`lib/api/connections/connection-apis.ts`**: `createConnection({ platform, token })`, `listConnections()`, `deleteConnection(id)`.
- **`lib/api/connections/connection-queries.ts`**: react-query query/mutation options (mirror `user-queries.ts`).
- **UI** (a `/connections` route or section): a form to paste a Telegram token + submit (shows validation/setWebhook errors from the API), a list of connected bots (displayName, status badge), and a delete action. Use the existing shadcn `button`/`card`.

---

## 11. Tests (Vitest, `apps/server`)

- `crypto.test.ts` — encrypt→decrypt round-trip; tamper detection.
- `telegram-provider.test.ts` — mock `fetch`: `validateCredentials` parses `getMe`; `registerWebhook` posts the right URL+secret; bad token throws.
- `connection.service.test.ts` — `create` stores encrypted token (not plaintext), generates a secret, calls `registerWebhook`; duplicate `[platform, externalId]` rejected.
- `webhooks.handler.test.ts` — **update** for the new `/:channel/:connectionId` path: 404 unknown connection, 403 wrong secret, 200 verified-but-no-message. Seed a connection row in the test DB / mock the lookup.
- `telegram-adapter.test.ts` — unchanged (`parseInbound`).

---

## 12. File-change checklist

**New**
- `prisma/` migration (Account, ChannelConnection, scoping cols, ConnectionStatus)
- `src/lib/crypto.ts`
- `src/channels/channel-provider.ts`, `src/channels/provider-registry.ts`
- `src/channels/telegram/telegram-provider.ts`
- `src/services/connection.service.ts`
- `src/routes/connections/{connections.route.ts,connections.handler.ts,index.ts}`
- `src/middlewares/account.ts`
- `apps/web/lib/api/connections/*`, connections UI

**Modified**
- `src/env.ts` (drop Telegram vars, add `APP_ENCRYPTION_KEY`), `.env.example`, `.env.test`
- `prisma/schema.prisma`, `prisma/seed` (default Account)
- `src/channels/index.ts` (`buildProviderRegistry`), `src/channels/types.ts` (`ConnectionContext`)
- `src/channels/telegram/telegram-adapter.ts` (only if any env coupling remains — currently none)
- `src/lib/container.ts` (registry + `connectionService`)
- `src/routes/webhooks/{index.ts,webhooks.handler.ts}`
- `src/services/{customer,conversation,ingest,reply}.service.ts` (account/connection scoping)
- `src/app.ts` (mount connections, apply account middleware)
- `apps/web/utils/request.ts`
- `src/routes/webhooks/webhooks.handler.test.ts`

**Removed**
- `scripts/set-telegram-webhook.ts`
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` from env + `.env*`
- `src/channels/channel-registry.ts` (superseded by `provider-registry.ts`)

---

## 13. Open follow-ups (not in this plan)

- **Real authentication** — the `x-account-id` header is a placeholder; swap in real auth at the account middleware.
- **Secret rotation / key rotation** for `APP_ENCRYPTION_KEY` (versioned key id in the packed token).
- **Webhook hardening at scale** — Lambda can't process inline forever; SQS + worker if volume grows (already noted in `implementation-telegram.md`). Note: per `MEMORY.md`, deployment is Docker on a persistent host, so in-process is fine for now.
- **Media handling** — Telegram `file_id` → object storage (unchanged from the original plan).
