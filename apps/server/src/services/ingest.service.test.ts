import { Platform } from "@/prisma/generated/client.js";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedInboundMessage } from "../channels/types.js";
import type { ConversationService } from "./conversation.service.js";
import type { CustomerService } from "./customer.service.js";
import { IngestService } from "./ingest.service.js";
import type { MessageService } from "./message.service.js";

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

function makeServices(storeInboundResults: Array<{ id: string } | null>) {
  const customers = { resolve: vi.fn().mockResolvedValue({ id: "cust-1" }) };
  const conversations = {
    findOrCreateOpen: vi.fn().mockResolvedValue({ id: "conv-1" }),
    touch: vi.fn().mockResolvedValue(undefined)
  };
  const storeInbound = vi.fn();
  for (const r of storeInboundResults) storeInbound.mockResolvedValueOnce(r);
  const messages = { storeInbound };

  const ingest = new IngestService(
    customers as unknown as CustomerService,
    conversations as unknown as ConversationService,
    messages as unknown as MessageService
  );
  return { ingest, customers, conversations, messages };
}

describe("IngestService.ingest", () => {
  it("stores a new message and touches the conversation", async () => {
    const { ingest, conversations, messages } = makeServices([{ id: "msg-1" }]);

    await ingest.ingest(msg);

    expect(messages.storeInbound).toHaveBeenCalledTimes(1);
    expect(conversations.touch).toHaveBeenCalledTimes(1);
    expect(conversations.touch).toHaveBeenCalledWith("conv-1", msg.timestamp);
  });

  it("is a no-op on a duplicate (second identical message stores once)", async () => {
    // First call stores; second hits the unique guard -> storeInbound returns null.
    const { ingest, conversations, messages } = makeServices([{ id: "msg-1" }, null]);

    await ingest.ingest(msg);
    await ingest.ingest(msg);

    expect(messages.storeInbound).toHaveBeenCalledTimes(2);
    // touch only ran for the first (non-duplicate) ingest.
    expect(conversations.touch).toHaveBeenCalledTimes(1);
  });
});
