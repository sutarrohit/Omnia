# Omnichannel Chat — Backend Implementation Plan

**Where this lives:** `apps/server` (`@repo/api`) in your Turborepo monorepo.
**Stack (yours):** Hono · `@hono/zod-openapi` + `hono-openapi` + Swagger UI · **Prisma 7** (`@prisma/client` + `@prisma/adapter-pg`) · PostgreSQL · Zod env (`src/env.ts`) · `hono-pino` · `hono-rate-limiter`.
**First channel:** Telegram.
**Goal:** A class-based, pluggable channel layer where adding a new channel (WhatsApp, Instagram, …) means writing **one new class** and registering it — routes, services, DB, and the reply path stay untouched.

> Implement **phase by phase**. Hand Claude one phase at a time; don't start phase _n+1_ until phase _n_ round-trips. All commands below assume the monorepo root unless noted, and scope to the API with `--filter=@repo/api`.

---

## 0. How this fits your existing server

Your server already has a clean separation that this design slots into:

| Your existing piece | What we add / reuse |
|---|---|
| `src/app.ts` (shared Hono app) | Mount the new `webhooks` and `conversations` routers here |
| `src/index.ts` (Node, port 4000) / `lambda/index.ts` | Unchanged — both reuse `app.ts` |
| `src/env.ts` (Zod env) | **Extend** with Telegram vars |
| `src/lib/` (prisma client, app factory, openapi, errors) | Reuse the Prisma client; add a small `container.ts` |
| `src/middlewares/` | Reuse logging / rate-limit / error handlers as-is |
| `src/routes/<feature>/` (`route` + `handler` + `index`) | New `webhooks/` and `conversations/` features in the same shape |
| `src/services/` (e.g. `demoService`) | New channel-agnostic services live here |
| `prisma/schema.prisma` | **Add** the chat models |

**One new top-level folder:** `src/channels/` — the pluggable channel layer (adapter base class, registry, and per-channel implementations). This is the only structural addition; everything else follows your current patterns.

### Target layout inside `apps/server`

```
apps/server/
├── src/
│   ├── app.ts                       # + mount webhooks & conversations
│   ├── index.ts                     # unchanged
│   ├── env.ts                       # + Telegram vars
│   ├── lib/
│   │   ├── prisma.ts                # existing client (adapter-pg) — reuse
│   │   └── container.ts             # NEW — wires registry + services
│   ├── middlewares/                 # unchanged
│   ├── channels/                    # NEW — pluggable channel layer
│   │   ├── types.ts
│   │   ├── channel-adapter.ts       # abstract base class (the contract)
│   │   ├── channel-registry.ts
│   │   ├── index.ts                 # buildChannelRegistry()
│   │   └── telegram/
│   │       ├── telegram-adapter.ts
│   │       └── telegram.types.ts
│   ├── routes/
│   │   ├── webhooks/                 # NEW feature route
│   │   │   ├── webhooks.handler.ts
│   │   │   └── index.ts
│   │   └── conversations/            # NEW feature route (zod-openapi)
│   │       ├── conversations.route.ts
│   │       ├── conversations.handler.ts
│   │       └── index.ts
│   └── services/                     # NEW services (classes)
│       ├── customer.service.ts
│       ├── conversation.service.ts
│       ├── message.service.ts
│       ├── ingest.service.ts
│       └── reply.service.ts
├── prisma/
│   └── schema.prisma                 # + chat models
└── scripts/
    └── set-telegram-webhook.ts       # NEW one-off
```

> Match your existing `routes/demo/` file naming exactly (e.g. `*.route.ts` / `*.handler.ts` / `index.ts`). The names above mirror the convention described in your README.

---

## 1. Routing decisions (read before phase 1)

- **Webhooks mount at the root, not under `/api/v1`.** Webhook URLs are external integration endpoints registered with providers; keeping them unversioned (`/webhooks/telegram`) means bumping your API version never breaks provider config. This matches how `/health` already sits at the root. They're a plain Hono sub-app (provider payloads are provider-defined, so they don't belong in your public OpenAPI spec).
- **Conversations are a normal versioned, OpenAPI-typed feature** under `/api/v1/conversations`, exactly like `demo/`, because the web frontend consumes them and they benefit from Swagger docs + Zod validation.

---

## 2. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| **1** | Extend `env.ts`; add Prisma chat models; migrate | `db:migrate` applies, tables visible in `prisma studio` |
| **2** | `channels/`: base class, registry, types | Compiles; registry resolves a stub adapter |
| **3** | `TelegramAdapter` + `set-telegram-webhook` script | Unit test `parseInbound` on a sample update passes |
| **4** | Services + `lib/container.ts` | `ingest()` twice with same message stores once |
| **5** | `webhooks/` router mounted in `app.ts` | Real Telegram message lands in DB |
| **6** | `reply.service` + `conversations` reply endpoint | Agent reply reaches Telegram; visible in Swagger |
| **7** | Inbox endpoints (list conversations, fetch thread) | Frontend can read data via `/api/v1` |
| **8** | Realtime push (see Lambda caveat) | New inbound messages appear live |
| **9** | Second channel | New adapter class, zero core changes |

---

## 3. Phase 1 — Env + schema

### Extend `src/env.ts`

Add to your existing Zod schema (don't create a new file):

```ts
// inside the existing z.object({ ... })
TELEGRAM_BOT_TOKEN: z.string().min(1),
TELEGRAM_WEBHOOK_SECRET: z.string().min(16),   // random string you generate
PUBLIC_URL: z.string().url(),                  // public base URL for webhook registration
```

Update `.env.example` and `.env` accordingly (alongside the existing `DATABASE_URL`, `DIRECT_URL`, `FRONTEND_URL`). For local dev, `PUBLIC_URL` points at an ngrok/cloudflared tunnel to port 4000.

### Add chat models to `prisma/schema.prisma`

Keep your existing `datasource`/`generator` blocks (Prisma 7 + `adapter-pg`). Add the chat domain alongside your current models:

```prisma
model Customer {
  id            String            @id @default(uuid())
  displayName   String?
  identities    ChannelIdentity[]
  conversations Conversation[]
  createdAt     DateTime          @default(now())
}

model ChannelIdentity {
  id            String   @id @default(uuid())
  customer      Customer @relation(fields: [customerId], references: [id])
  customerId    String
  channel       String                          // "telegram"
  channelUserId String                          // Telegram chat id (as string)
  createdAt     DateTime @default(now())

  @@unique([channel, channelUserId])
  @@index([customerId])
}

model Conversation {
  id              String             @id @default(uuid())
  customer        Customer           @relation(fields: [customerId], references: [id])
  customerId      String
  channel         String
  status          ConversationStatus @default(OPEN)
  assignedAgentId String?
  lastMessageAt   DateTime?
  messages        Message[]
  createdAt       DateTime           @default(now())

  @@index([channel, status])
  @@index([assignedAgentId])
}

model Message {
  id               String        @id @default(uuid())
  conversation     Conversation  @relation(fields: [conversationId], references: [id])
  conversationId   String
  direction        Direction
  type             MessageType   @default(TEXT)
  content          String?
  mediaUrl         String?
  channelMessageId String?                        // platform id, for dedupe
  status           MessageStatus @default(PENDING)
  raw              Json?
  createdAt        DateTime      @default(now())

  @@unique([conversationId, channelMessageId])     // idempotency guard
  @@index([conversationId, createdAt])
}

enum ConversationStatus { OPEN PENDING CLOSED }
enum Direction          { INBOUND OUTBOUND }
enum MessageType        { TEXT IMAGE FILE AUDIO VIDEO }
enum MessageStatus      { PENDING SENT DELIVERED READ FAILED }
```

> An `Agent` model can come later (phase 7/8). `assignedAgentId` is a plain string for now so you're not blocked.

```sh
pnpm --filter=@repo/api run db:generate
pnpm --filter=@repo/api run db:migrate
```

**Done when:** migration applies and the tables show up in `prisma studio`.

---

## 4. Phase 2 — The channel contract (`src/channels/`)

This is what makes channels pluggable. Get it right and every later channel is trivial.

### `src/channels/types.ts`

```ts
export interface NormalizedInboundMessage {
  channel: string;
  channelUserId: string;        // who sent it, in the platform's ID scheme
  channelMessageId: string;     // platform's unique message id (dedupe key)
  type: "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "VIDEO";
  content?: string;
  mediaUrl?: string;
  senderName?: string;
  timestamp: Date;
  raw: unknown;                 // untouched original payload
}

export interface OutboundMessage {
  type: "TEXT";                 // extend later
  content: string;
}

export interface SendResult {
  channelMessageId: string;
}

export interface WebhookRequest {
  headers: Record<string, string | undefined>;
  body: unknown;
}
```

### `src/channels/channel-adapter.ts` — abstract base class

```ts
import type {
  NormalizedInboundMessage, OutboundMessage, SendResult, WebhookRequest,
} from "./types";

export abstract class ChannelAdapter {
  /** Unique channel id, e.g. "telegram". Registry key. */
  abstract readonly channel: string;

  /** Validate the webhook is genuinely from the provider. */
  abstract verifyWebhook(req: WebhookRequest): boolean;

  /** Provider payload -> zero or more normalized messages. */
  abstract parseInbound(payload: unknown): NormalizedInboundMessage[];

  /** Deliver an outbound message to a recipient on this channel. */
  abstract sendMessage(channelUserId: string, message: OutboundMessage): Promise<SendResult>;
}
```

### `src/channels/channel-registry.ts`

```ts
import type { ChannelAdapter } from "./channel-adapter";

export class ChannelRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.channel)) {
      throw new Error(`Adapter already registered: ${adapter.channel}`);
    }
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: string): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) throw new Error(`Unknown channel: ${channel}`);
    return adapter;
  }

  has(channel: string): boolean {
    return this.adapters.has(channel);
  }
}
```

**Done when:** it compiles and a throwaway stub adapter can be registered and fetched.

---

## 5. Phase 3 — Telegram adapter

Telegram notes: it pushes **updates** to your webhook; each may contain a `message`. The user/chat is `message.chat.id`. Secure it by passing a `secret_token` to `setWebhook`; Telegram echoes it in the `X-Telegram-Bot-Api-Secret-Token` header on every call. There's **no 24-hour messaging window** (unlike WhatsApp), so the reply path is unconditional — a friendly first channel.

### `src/channels/telegram/telegram.types.ts`

```ts
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}
export interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number;                  // unix seconds
  text?: string;
  photo?: { file_id: string }[];
}
```

### `src/channels/telegram/telegram-adapter.ts`

```ts
import { ChannelAdapter } from "../channel-adapter";
import type {
  NormalizedInboundMessage, OutboundMessage, SendResult, WebhookRequest,
} from "../types";
import type { TelegramUpdate } from "./telegram.types";

export class TelegramAdapter extends ChannelAdapter {
  readonly channel = "telegram";

  constructor(
    private readonly botToken: string,
    private readonly webhookSecret: string,
  ) {
    super();
  }

  private get apiBase() {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  verifyWebhook(req: WebhookRequest): boolean {
    return req.headers["x-telegram-bot-api-secret-token"] === this.webhookSecret;
  }

  parseInbound(payload: unknown): NormalizedInboundMessage[] {
    const msg = (payload as TelegramUpdate).message;
    if (!msg) return [];                       // ignore non-message updates for now

    return [{
      channel: this.channel,
      channelUserId: String(msg.chat.id),
      channelMessageId: String(msg.message_id),
      type: msg.text ? "TEXT" : msg.photo ? "IMAGE" : "TEXT",
      content: msg.text,
      senderName: msg.from?.first_name ?? msg.from?.username,
      timestamp: new Date(msg.date * 1000),
      raw: payload,
    }];
  }

  async sendMessage(channelUserId: string, message: OutboundMessage): Promise<SendResult> {
    const res = await fetch(`${this.apiBase}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelUserId, text: message.content }),
    });
    const data = (await res.json()) as {
      ok: boolean; result?: { message_id: number }; description?: string;
    };
    if (!data.ok || !data.result) {
      throw new Error(`Telegram send failed: ${data.description ?? "unknown"}`);
    }
    return { channelMessageId: String(data.result.message_id) };
  }
}
```

### `src/channels/index.ts` — build & register all adapters

```ts
import { ChannelRegistry } from "./channel-registry";
import { TelegramAdapter } from "./telegram/telegram-adapter";
import { env } from "../env";

export function buildChannelRegistry(): ChannelRegistry {
  const registry = new ChannelRegistry();
  registry.register(new TelegramAdapter(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_WEBHOOK_SECRET));
  // registry.register(new WhatsAppAdapter(...));  // later
  return registry;
}
```

### `scripts/set-telegram-webhook.ts` (one-off, run with tsx)

```ts
import { env } from "../src/env";

const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${env.PUBLIC_URL}/webhooks/telegram`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
  }),
});
console.log(await res.json());
```

Add a script in `apps/server/package.json`: `"webhook:telegram": "tsx scripts/set-telegram-webhook.ts"`.

**Done when:** a Vitest unit test passes a sample update to `parseInbound` and gets one correct normalized message. (You already use Vitest — put it in `src/channels/telegram/telegram-adapter.test.ts`.)

---

## 6. Phase 4 — Services + container

Services are classes with injected dependencies, living in `src/services/`. They only ever see `NormalizedInboundMessage` — fully channel-agnostic. They reuse your **existing** Prisma client from `src/lib/prisma.ts`.

### `src/services/customer.service.ts`

```ts
import type { PrismaClient } from "@prisma/client";

export class CustomerService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolve(channel: string, channelUserId: string, displayName?: string) {
    const existing = await this.prisma.channelIdentity.findUnique({
      where: { channel_channelUserId: { channel, channelUserId } },
      include: { customer: true },
    });
    if (existing) return existing.customer;

    return this.prisma.customer.create({
      data: { displayName, identities: { create: { channel, channelUserId } } },
    });
  }
}
```

### `src/services/conversation.service.ts`

```ts
import type { PrismaClient } from "@prisma/client";

export class ConversationService {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrCreateOpen(customerId: string, channel: string) {
    return (
      (await this.prisma.conversation.findFirst({
        where: { customerId, channel, status: "OPEN" },
      })) ??
      (await this.prisma.conversation.create({
        data: { customerId, channel, status: "OPEN" },
      }))
    );
  }

  async touch(id: string, at: Date) {
    await this.prisma.conversation.update({ where: { id }, data: { lastMessageAt: at } });
  }
}
```

### `src/services/message.service.ts`

```ts
import { Prisma, type PrismaClient, type MessageType, type MessageStatus } from "@prisma/client";

export class MessageService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Returns null on duplicate (unique-constraint guard). */
  async storeInbound(data: {
    conversationId: string; type: MessageType; content?: string;
    mediaUrl?: string; channelMessageId: string; raw: unknown;
  }) {
    try {
      return await this.prisma.message.create({
        data: {
          conversationId: data.conversationId, direction: "INBOUND",
          type: data.type, content: data.content, mediaUrl: data.mediaUrl,
          channelMessageId: data.channelMessageId, status: "DELIVERED",
          raw: data.raw as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
      throw e;
    }
  }

  async storeOutbound(conversationId: string, content: string) {
    return this.prisma.message.create({
      data: { conversationId, direction: "OUTBOUND", type: "TEXT", content, status: "PENDING" },
    });
  }

  async markStatus(id: string, status: MessageStatus, channelMessageId?: string) {
    await this.prisma.message.update({ where: { id }, data: { status, channelMessageId } });
  }
}
```

### `src/services/ingest.service.ts`

```ts
import type { NormalizedInboundMessage } from "../channels/types";
import type { CustomerService } from "./customer.service";
import type { ConversationService } from "./conversation.service";
import type { MessageService } from "./message.service";

export class IngestService {
  constructor(
    private readonly customers: CustomerService,
    private readonly conversations: ConversationService,
    private readonly messages: MessageService,
  ) {}

  async ingest(msg: NormalizedInboundMessage): Promise<void> {
    const customer = await this.customers.resolve(msg.channel, msg.channelUserId, msg.senderName);
    const conversation = await this.conversations.findOrCreateOpen(customer.id, msg.channel);

    const stored = await this.messages.storeInbound({
      conversationId: conversation.id, type: msg.type, content: msg.content,
      mediaUrl: msg.mediaUrl, channelMessageId: msg.channelMessageId, raw: msg.raw,
    });
    if (!stored) return;                       // duplicate webhook — no-op

    await this.conversations.touch(conversation.id, msg.timestamp);
    // Phase 8: push `stored` to the assigned agent here.
  }
}
```

### `src/services/reply.service.ts`

```ts
import type { PrismaClient } from "@prisma/client";
import type { ChannelRegistry } from "../channels/channel-registry";
import type { MessageService } from "./message.service";

export class ReplyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: ChannelRegistry,
    private readonly messages: MessageService,
  ) {}

  async reply(conversationId: string, content: string) {
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { customer: { include: { identities: true } } },
    });
    const identity = conv.customer.identities.find((i) => i.channel === conv.channel);
    if (!identity) throw new Error("no channel identity for this conversation");

    const stored = await this.messages.storeOutbound(conversationId, content);
    try {
      const result = await this.registry.get(conv.channel)
        .sendMessage(identity.channelUserId, { type: "TEXT", content });
      await this.messages.markStatus(stored.id, "SENT", result.channelMessageId);
    } catch (err) {
      await this.messages.markStatus(stored.id, "FAILED");
      throw err;
    }
    return stored;
  }
}
```

### `src/lib/container.ts` — wire once, import everywhere

```ts
import { prisma } from "./prisma";                  // your existing client
import { buildChannelRegistry } from "../channels";
import { CustomerService } from "../services/customer.service";
import { ConversationService } from "../services/conversation.service";
import { MessageService } from "../services/message.service";
import { IngestService } from "../services/ingest.service";
import { ReplyService } from "../services/reply.service";

export const channelRegistry = buildChannelRegistry();

const customers = new CustomerService(prisma);
const conversations = new ConversationService(prisma);
const messages = new MessageService(prisma);

export const ingestService = new IngestService(customers, conversations, messages);
export const replyService = new ReplyService(prisma, channelRegistry, messages);
```

**Done when:** calling `ingestService.ingest()` twice with the same message creates rows once; the second call is a no-op.

---

## 7. Phase 5 — Webhook route (plain Hono, mounted at root)

### `src/routes/webhooks/webhooks.handler.ts`

```ts
import type { Context } from "hono";
import { channelRegistry, ingestService } from "../../lib/container";

export async function handleWebhook(c: Context) {
  const channel = c.req.param("channel");
  if (!channelRegistry.has(channel)) return c.json({ error: "unknown channel" }, 404);

  const adapter = channelRegistry.get(channel);
  const body = await c.req.json().catch(() => ({}));
  const headers = Object.fromEntries(
    [...c.req.raw.headers].map(([k, v]) => [k.toLowerCase(), v]),
  );

  if (!adapter.verifyWebhook({ headers, body })) {
    return c.json({ error: "forbidden" }, 403);
  }

  try {
    for (const msg of adapter.parseInbound(body)) {
      await ingestService.ingest(msg);
    }
  } catch (err) {
    c.var.logger.error({ err, channel }, "webhook processing failed");
    // still ack 200 — avoid provider retry storms
  }
  return c.body(null, 200);
}
```

### `src/routes/webhooks/index.ts`

```ts
import { Hono } from "hono";
import { handleWebhook } from "./webhooks.handler";

export const webhooksRouter = new Hono();
webhooksRouter.post("/:channel", handleWebhook);
```

### Mount in `src/app.ts`

Add **before/alongside** your `/api/v1` group (root-level, like `/health`):

```ts
import { webhooksRouter } from "./routes/webhooks";
app.route("/webhooks", webhooksRouter);
```

The cardinal rule is baked in: **verify → process → ack `200` fast**, and ack even on internal error so Telegram doesn't retry-storm you (the error is logged via `hono-pino`).

**Done when:** you message your bot and the row appears in `prisma studio`. (Run `pnpm --filter=@repo/api run webhook:telegram` once, with `PUBLIC_URL` pointing at your tunnel.)

---

## 8. Phase 6 — Reply endpoint (OpenAPI feature route)

This one follows your `demo/` convention exactly so it shows up in Swagger UI.

### `src/routes/conversations/conversations.route.ts`

```ts
import { createRoute, z } from "@hono/zod-openapi";

export const replyRoute = createRoute({
  method: "post",
  path: "/{id}/reply",
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": { schema: z.object({ content: z.string().min(1) }) },
      },
    },
  },
  responses: {
    201: {
      description: "Reply sent",
      content: {
        "application/json": {
          schema: z.object({ id: z.string(), status: z.string() }),
        },
      },
    },
  },
});
```

### `src/routes/conversations/conversations.handler.ts`

```ts
import type { RouteHandler } from "@hono/zod-openapi";
import { replyService } from "../../lib/container";
import type { replyRoute } from "./conversations.route";

export const replyHandler: RouteHandler<typeof replyRoute> = async (c) => {
  const { id } = c.req.valid("param");
  const { content } = c.req.valid("json");
  const msg = await replyService.reply(id, content);
  return c.json({ id: msg.id, status: msg.status }, 201);
};
```

### `src/routes/conversations/index.ts`

```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { replyRoute } from "./conversations.route";
import { replyHandler } from "./conversations.handler";

export const conversationsRouter = new OpenAPIHono();
conversationsRouter.openapi(replyRoute, replyHandler);
```

Mount under your versioned group in `app.ts`: `app.route("/api/v1/conversations", conversationsRouter)` (or however `demo` is mounted).

**Done when:** `POST /api/v1/conversations/{id}/reply` makes your bot send the message, and the endpoint appears in Swagger.

---

## 9. Phase 7 — Inbox read endpoints

Add list + thread routes in the same `conversations/` feature (and a `messages` query as needed), all zod-openapi typed:

- `GET /api/v1/conversations?status=OPEN` — list, newest `lastMessageAt` first.
- `GET /api/v1/conversations/{id}/messages` — the thread, ascending by `createdAt`.

These are straight Prisma reads through a small query service; follow the same route/handler/index split. This is what the Next.js `apps/web` frontend calls via its `utils/request.ts` wrapper (`NEXT_PUBLIC_API_URL` → `/api/v1`).

---

## 10. Phase 8 — Realtime — and the Lambda caveat

Agents need new inbound messages without refreshing. **How you do this depends on where the server runs:**

- **Local / a persistent Node host (`@hono/node-server`):** add a WebSocket (or SSE) layer and, in `IngestService`, push `stored` to the assigned agent after saving. Straightforward.
- **AWS Lambda (your `lambda/index.ts` + Function URL):** Lambda **cannot hold WebSocket connections** in the request/response model. Options, cheapest first:
  1. A managed realtime service (Pusher / Ably / Supabase Realtime) — `IngestService` publishes an event; the browser subscribes. No persistent server needed; works fine from Lambda.
  2. API Gateway **WebSocket API** with a DynamoDB connection table — more infra, fully AWS-native.
  3. Run the realtime piece on a small persistent host (ECS/Fargate/EC2) while webhooks stay on Lambda.

Pick (1) for speed. Keep `IngestService` emitting a single "new message" event so the transport is swappable.

> Same caveat for a **background queue**: BullMQ needs Redis + a long-running worker, which doesn't fit Lambda. If you stay on Lambda and volume grows, use **SQS + a worker Lambda** instead of processing inline. For now, inline processing in the webhook handler is fine.

---

## 11. Adding a new channel later (the payoff)

To add WhatsApp you touch exactly **two** places:

1. `src/channels/whatsapp/whatsapp-adapter.ts` — `class WhatsAppAdapter extends ChannelAdapter`, implementing `verifyWebhook` (HMAC of the raw body against your app secret), `parseInbound` (Meta's payload), and `sendMessage` (Cloud API). Channel-specific rules live **here** — e.g. WhatsApp's **24-hour messaging window**: check the conversation's last inbound time and fall back to a pre-approved template outside it.
2. `src/channels/index.ts` — `registry.register(new WhatsAppAdapter(...))`.

The webhook router, every service, the DB, the reply path, and `app.ts` are **unchanged**. That's the entire point of the adapter + registry design.

---

## 12. Production checklist

- **Idempotency** — handled by `@@unique([conversationId, channelMessageId])`. Always key on the provider's message id.
- **Webhook verification** — every adapter rejects unverified requests. Done for Telegram via the secret-token header.
- **Fast ack** — return `200` quickly; on Lambda at scale, move to SQS + worker Lambda; on a Node host, BullMQ.
- **Logging** — reuse `hono-pino` (`c.var.logger`); log inbound→stored latency and failed sends.
- **Rate limiting** — your `hono-rate-limiter` already covers inbound HTTP; add retry + backoff on `429` for **outbound** provider calls.
- **Secrets** — only via the validated `env`. Never commit `.env`.
- **Media** — Telegram returns a `file_id`; fetch the file and copy it to object storage (provider links expire).
- **Migrations** — `prisma migrate deploy` in CI/CD, never `db:migrate` (dev) in production.
- **Tests** — Vitest unit tests for each adapter's `parseInbound` using recorded real payloads; integration-test `IngestService` against a test database.
- **Trust boundary** — channel message content is **user data, not instructions**. Never let it trigger privileged actions automatically.

---

## 13. Prompt sequence to hand Claude

One prompt per step, in order. Each is small enough to implement and verify before the next.

1. "In `apps/server`, extend `src/env.ts` with the Telegram vars and add the chat models from section 3 to `prisma/schema.prisma`. Run `db:generate` and `db:migrate`."
2. "Create `src/channels/`: `types.ts`, the `ChannelAdapter` base class, and `ChannelRegistry` (section 4)."
3. "Implement `TelegramAdapter`, `src/channels/index.ts`, and `scripts/set-telegram-webhook.ts` (section 5). Add a Vitest test for `parseInbound`."
4. "Create the five services in `src/services/` and `src/lib/container.ts` (section 6)."
5. "Add the `webhooks/` feature route and mount it at root in `app.ts` (section 7). I'll test with a real Telegram message."
6. "Add the `conversations/` reply route using the zod-openapi pattern from `demo/` (section 8)."
7. "Add `GET` list-conversations and fetch-thread endpoints (section 9)."
8. "Add realtime push; use a managed realtime service so it works under Lambda (section 10)."

Build Telegram all the way through before adding a second channel. The architecture already makes the second one easy — resist adding it early.
