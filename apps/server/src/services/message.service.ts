import {
  Prisma,
  type MessageStatus,
  type MessageType,
  type PrismaClient
} from "@/prisma/generated/client.js";

export class MessageService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Store an inbound message. Returns null on a duplicate (unique-constraint guard). */
  async storeInbound(data: {
    conversationId: string;
    type: MessageType;
    content?: string;
    mediaUrl?: string;
    channelMessageId: string;
    raw: unknown;
  }) {
    try {
      return await this.prisma.message.create({
        data: {
          conversationId: data.conversationId,
          direction: "INBOUND",
          type: data.type,
          content: data.content,
          mediaUrl: data.mediaUrl,
          channelMessageId: data.channelMessageId,
          status: "DELIVERED",
          raw: data.raw as Prisma.InputJsonValue
        }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
      throw e;
    }
  }

  async storeOutbound(conversationId: string, content: string) {
    return this.prisma.message.create({
      data: { conversationId, direction: "OUTBOUND", type: "TEXT", content, status: "PENDING" }
    });
  }

  async markStatus(id: string, status: MessageStatus, channelMessageId?: string) {
    return this.prisma.message.update({ where: { id }, data: { status, channelMessageId } });
  }
}
