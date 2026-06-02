import type { PrismaClient } from "@/prisma/generated/client.js";
import type { ChannelRegistry } from "../channels/channel-registry.js";
import { messageCreated, type RealtimeHub } from "../lib/realtime.js";
import type { MessageService } from "./message.service.js";

export class ReplyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: ChannelRegistry,
    private readonly messages: MessageService,
    private readonly realtime: RealtimeHub
  ) {}

  async reply(conversationId: string, content: string) {
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { customer: { include: { identities: true } } }
    });
    const identity = conv.customer.identities.find((i) => i.channel === conv.channel);
    if (!identity) throw new Error("no channel identity for this conversation");

    const stored = await this.messages.storeOutbound(conversationId, content);
    try {
      const result = await this.registry
        .get(conv.channel)
        .sendMessage(identity.channelUserId, { type: "TEXT", content });
      const sent = await this.messages.markStatus(stored.id, "SENT", result.channelMessageId);
      this.realtime.publish(messageCreated(sent)); // fan out the outbound message too
      return sent;
    } catch (err) {
      await this.messages.markStatus(stored.id, "FAILED");
      throw err;
    }
  }
}
