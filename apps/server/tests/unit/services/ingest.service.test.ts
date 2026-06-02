import { Platform } from "@/prisma/generated/client.js";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedInboundMessage } from "@/src/channels/types.js";
import { RealtimeHub } from "@/src/lib/realtime.js";
import type { ConversationService } from "@/src/services/conversation.service.js";
import type { CustomerService } from "@/src/services/customer.service.js";
import { IngestService } from "@/src/services/ingest.service.js";
import type { MessageService } from "@/src/services/message.service.js";

const msg: NormalizedInboundMessage = {
  channel: Platform.TELEGRAM,
  channelUserId: "12345",
  channelMessageId: "42",
  type: "TEXT",
  content: "hello",
  senderName: "Ada",
  timestamp: new Date(1_700_000_000 * 1000),
  raw: {}
};

/** A stored-message stand-in with the fields the realtime mapper reads. */
function storedRow(id: string) {
  return {
    id,
    conversationId: "conv-1",
    direction: "INBOUND",
    type: "TEXT",
    content: "hello",
    status: "DELIVERED",
    createdAt: new Date(1_700_000_000 * 1000)
  };
}

function makeServices(storeInboundResults: Array<ReturnType<typeof storedRow> | null>) {
  const customers = { resolve: vi.fn().mockResolvedValue({ id: "cust-1" }) };
  const conversations = {
    findOrCreateOpen: vi.fn().mockResolvedValue({ id: "conv-1" }),
    touch: vi.fn().mockResolvedValue(undefined)
  };
  const storeInbound = vi.fn();
  for (const r of storeInboundResults) storeInbound.mockResolvedValueOnce(r);
  const messages = { storeInbound };
  const realtime = new RealtimeHub();
  const published: unknown[] = [];
  realtime.subscribe((e) => published.push(e));

  const ingest = new IngestService(
    customers as unknown as CustomerService,
    conversations as unknown as ConversationService,
    messages as unknown as MessageService,
    realtime
  );
  return { ingest, customers, conversations, messages, published };
}

describe("IngestService.ingest", () => {
  it("stores a new message, touches the conversation, and publishes a realtime event", async () => {
    const { ingest, conversations, messages, published } = makeServices([storedRow("msg-1")]);

    await ingest.ingest(msg);

    expect(messages.storeInbound).toHaveBeenCalledTimes(1);
    expect(conversations.touch).toHaveBeenCalledTimes(1);
    expect(conversations.touch).toHaveBeenCalledWith("conv-1", msg.timestamp);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ type: "message.created", conversationId: "conv-1" });
  });

  it("is a no-op on a duplicate (second identical message stores once, no event)", async () => {
    // First call stores; second hits the unique guard -> storeInbound returns null.
    const { ingest, conversations, messages, published } = makeServices([storedRow("msg-1"), null]);

    await ingest.ingest(msg);
    await ingest.ingest(msg);

    expect(messages.storeInbound).toHaveBeenCalledTimes(2);
    // touch + publish only ran for the first (non-duplicate) ingest.
    expect(conversations.touch).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
  });
});
