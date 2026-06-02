import type { ConversationStatus, Platform, PrismaClient } from "@/prisma/generated/client.js";

export class ConversationService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Inbox list: conversations (optionally filtered by status), newest activity first. */
  async list(params: { status?: ConversationStatus; page: number; pageSize: number }) {
    const { status, page, pageSize } = params;
    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, displayName: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 } // latest-message preview
        }
      }),
      this.prisma.conversation.count({ where })
    ]);

    return { data, total };
  }

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
