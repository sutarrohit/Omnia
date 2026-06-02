import type { Platform, PrismaClient } from "@/prisma/generated/client.js";

export class ConversationService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Return the customer's open conversation on this channel, or open a new one. */
  async findOrCreateOpen(customerId: string, channel: Platform) {
    return (
      (await this.prisma.conversation.findFirst({
        where: { customerId, channel, status: "OPEN" }
      })) ??
      (await this.prisma.conversation.create({
        data: { customerId, channel, status: "OPEN" }
      }))
    );
  }

  async touch(id: string, at: Date) {
    await this.prisma.conversation.update({ where: { id }, data: { lastMessageAt: at } });
  }
}
