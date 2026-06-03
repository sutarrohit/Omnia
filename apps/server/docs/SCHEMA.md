# Data Model & Message Flow

Schema and message-flow diagrams for the multi-bot omnichannel inbox.

- **Tenant** is `Organization` (better-auth organization plugin).
- **One `ChannelConnection` = one connected bot.** Per-platform capability lives in code (`ChannelProvider`); per-bot credentials live in the DB.
- **Ingress** = a message arriving from a provider (e.g. Telegram) → stored.
- **Egress** = an agent reply → sent back out via the correct bot.

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
  Organization ||--o{ ChannelConnection : owns
  Organization ||--o{ Customer : has
  Organization ||--o{ Conversation : has
  Organization ||--o{ Member : has
  Organization ||--o{ Invitation : has

  User ||--o{ Session : has
  User ||--o{ Account : has
  User ||--o{ Member : "is"
  User ||--o{ Invitation : invited

  ChannelConnection ||--o{ ChannelIdentity : "seen on"
  ChannelConnection ||--o{ Conversation : scopes

  Customer ||--o{ ChannelIdentity : "appears as"
  Customer ||--o{ Conversation : participates

  Conversation ||--o{ Message : contains

  Organization {
    string id PK
    string name
    string slug UK
  }
  ChannelConnection {
    string id PK
    string organizationId FK
    enum   platform "TELEGRAM | ..."
    string externalId "provider bot id"
    string displayName "bot username/title"
    string encryptedToken "AES-256-GCM"
    string webhookSecret "per-bot secret"
    enum   status "ACTIVE|DISABLED|ERROR"
    json   meta
    uk     platform_externalId "UNIQUE(platform, externalId)"
  }
  Customer {
    string id PK
    string organizationId FK
    string displayName
  }
  ChannelIdentity {
    string id PK
    string customerId FK
    string connectionId FK
    enum   channel
    string channelUserId "provider user/chat id"
    uk     connectionId_channelUserId "UNIQUE(connectionId, channelUserId)"
  }
  Conversation {
    string id PK
    string organizationId FK
    string customerId FK
    string connectionId FK
    enum   channel
    enum   status "OPEN|PENDING|CLOSED"
    string assignedAgentId
    datetime lastMessageAt
  }
  Message {
    string id PK
    string conversationId FK
    enum   direction "INBOUND|OUTBOUND"
    enum   type "TEXT|IMAGE|FILE|AUDIO|VIDEO"
    string content
    string mediaUrl
    string channelMessageId "provider msg id (dedupe)"
    enum   status "PENDING|SENT|DELIVERED|READ|FAILED"
    json   raw
    uk     conversationId_channelMessageId "UNIQUE(conversationId, channelMessageId)"
  }
  Member {
    string id PK
    string organizationId FK
    string userId FK
    string role "owner|admin|member"
  }
  User {
    string id PK
    string email UK
    string name
  }
  Session {
    string id PK
    string userId FK
    string activeOrganizationId "resolves the tenant"
  }
  Account {
    string id PK
    string userId FK
    string providerId
    string password "credential auth"
  }
  Invitation {
    string id PK
    string organizationId FK
    string inviterId FK
    string email
  }
```

> **Auth models** (`User`, `Session`, `Account`, `Verification`, `Member`, `Invitation`, `Organization`) are owned by better-auth. The active tenant is resolved from `Session.activeOrganizationId`.
>
> **Domain models** (`ChannelConnection`, `Customer`, `ChannelIdentity`, `Conversation`, `Message`) are app-owned and all hang off `Organization`.

---

## 2. Ingress — inbound message (provider → DB)

A provider delivers an update to the per-bot webhook URL `…/webhooks/:channel/:connectionId`.
The route is **public**, secured by the connection's `webhookSecret` (not auth).

```mermaid
sequenceDiagram
  autonumber
  participant TG as Telegram
  participant WH as webhooks.handler
  participant CS as ConnectionService
  participant AD as Channel Adapter
  participant IN as IngestService
  participant DB as Postgres
  participant RT as RealtimeHub (SSE)

  TG->>WH: POST /webhooks/telegram/:connectionId
  WH->>CS: loadActiveForWebhook(connectionId, TELEGRAM)
  CS->>DB: find ChannelConnection (ACTIVE, platform match)
  DB-->>CS: connection row
  alt not found / wrong platform / not ACTIVE
    WH-->>TG: 404
  end
  WH->>CS: toContext(connection)  %% decrypts token
  CS-->>WH: ConnectionContext
  WH->>AD: verifyWebhook(headers)  %% X-Telegram-Bot-Api-Secret-Token == webhookSecret
  alt bad secret
    WH-->>TG: 403
  end
  WH->>AD: parseInbound(body) -> NormalizedInboundMessage[]
  loop each message
    WH->>IN: ingest(msg, ctx)
    IN->>DB: resolve Customer + ChannelIdentity (by connectionId, channelUserId)
    IN->>DB: findOrCreateOpen Conversation (org + customer + connection)
    IN->>DB: storeInbound Message (dedupe on channelMessageId)
    IN->>DB: touch Conversation.lastMessageAt
    IN->>RT: publish(message.created)
  end
  WH-->>TG: 200 (always ack, avoid retry storms)
```

**Writes:** `Customer` (+`ChannelIdentity`) if new, `Conversation` if no open one, one `Message` (INBOUND). A duplicate webhook (same `channelMessageId`) is a no-op.

---

## 3. Egress — agent reply (DB → provider)

An agent replies from the inbox UI. The reply is sent via **the conversation's own bot** —
its connection's decrypted token — not a global one.

```mermaid
sequenceDiagram
  autonumber
  participant UI as Web inbox
  participant API as conversations route
  participant RP as ReplyService
  participant CS as ConnectionService
  participant AD as Channel Adapter
  participant DB as Postgres
  participant TG as Telegram
  participant RT as RealtimeHub (SSE)

  UI->>API: POST /api/v1/conversations/:id/reply { content }
  API->>RP: reply(conversationId, content)
  RP->>DB: load Conversation + connection + customer.identities
  RP->>DB: storeOutbound Message (status=PENDING)
  RP->>CS: adapter(conversation.connection)  %% provider.adapter(toContext)
  CS-->>RP: Channel Adapter (decrypted token)
  RP->>AD: sendMessage(channelUserId, { TEXT, content })
  AD->>TG: POST /bot<token>/sendMessage
  alt send ok
    TG-->>AD: { message_id }
    RP->>DB: markStatus(SENT, channelMessageId)
    RP->>RT: publish(message.created)
    RP-->>API: { id, status: SENT }
  else send fails
    RP->>DB: markStatus(FAILED)
    RP-->>API: error
  end
```

**Writes:** one `Message` (OUTBOUND), then a status update to `SENT` or `FAILED`.

> **Note (current state):** the `/api/v1/conversations` routes are **not yet org-scoped** — the auth middleware that resolves the tenant from the session and filters by `organizationId` arrives in **Phase 8**. The webhook (ingress) path is already fully connection-scoped.
