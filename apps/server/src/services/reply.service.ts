import type { PrismaClient } from "@/prisma/generated/client.js";
import { messageCreated, type RealtimeHub } from "../lib/realtime.js";
import type { ConnectionService } from "./connection.service.js";
import type { MessageService } from "./message.service.js";

export class ReplyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly connections: ConnectionService,
    private readonly messages: MessageService,
    private readonly realtime: RealtimeHub
  ) {}

  async reply(conversationId: string, content: string) {
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { connection: true, customer: { include: { identities: true } } }
    });
    const identity = conv.customer.identities.find((i) => i.connectionId === conv.connectionId);
    if (!identity) throw new Error("no channel identity for this conversation");

    const stored = await this.messages.storeOutbound(conversationId, content);
    try {
      // Send via the conversation's own bot — that connection's decrypted token.
      const adapter = this.connections.adapter(conv.connection);
      const result = await adapter.sendMessage(identity.channelUserId, { type: "TEXT", content });
      const sent = await this.messages.markStatus(stored.id, "SENT", result.channelMessageId);
      this.realtime.publish(messageCreated(sent)); // fan out the outbound message too
      return sent;
    } catch (err) {
      await this.messages.markStatus(stored.id, "FAILED");
      throw err;
    }
  }
}
