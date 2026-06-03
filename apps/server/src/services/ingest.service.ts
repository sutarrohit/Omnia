import type { ConnectionContext, NormalizedInboundMessage } from "../channels/types.js";
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

  /** Ingest one normalized message that arrived on a specific bot connection. */
  async ingest(msg: NormalizedInboundMessage, ctx: ConnectionContext): Promise<void> {
    const customer = await this.customers.resolve(
      ctx.organizationId,
      ctx.id,
      msg.channel,
      msg.channelUserId,
      msg.senderName
    );
    const conversation = await this.conversations.findOrCreateOpen(
      ctx.organizationId,
      customer.id,
      ctx.id,
      msg.channel
    );

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
