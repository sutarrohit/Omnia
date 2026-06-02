import type { NormalizedInboundMessage } from "../channels/types.js";
import { messageCreated, type RealtimeHub } from "../lib/realtime.js";
import type { ConversationService } from "./conversation.service.js";
import type { CustomerService } from "./customer.service.js";
import type { MessageService } from "./message.service.js";

export class IngestService {
  constructor(
    private readonly customers: CustomerService,
    private readonly conversations: ConversationService,
    private readonly messages: MessageService,
    private readonly realtime: RealtimeHub
  ) {}

  async ingest(msg: NormalizedInboundMessage): Promise<void> {
    const customer = await this.customers.resolve(msg.channel, msg.channelUserId, msg.senderName);
    const conversation = await this.conversations.findOrCreateOpen(customer.id, msg.channel);

    const stored = await this.messages.storeInbound({
      conversationId: conversation.id,
      type: msg.type,
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      channelMessageId: msg.channelMessageId,
      raw: msg.raw
    });
    if (!stored) return; // duplicate webhook — no-op

    await this.conversations.touch(conversation.id, msg.timestamp);
    this.realtime.publish(messageCreated(stored)); // fan out to live subscribers
  }
}
