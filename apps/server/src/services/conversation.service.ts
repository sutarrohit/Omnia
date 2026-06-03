import type { ConversationStatus, Platform, PrismaClient } from "@/prisma/generated/client.js";

export class ConversationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Inbox list, newest activity first. Filter by org and/or bot connection and/or
   * status. (org/connection are optional until the auth middleware always supplies
   * the org — see Phase 8.)
   */
  async list(params: {
    organizationId?: string;
    connectionId?: string;
    status?: ConversationStatus;
    page: number;
    pageSize: number;
  }) {
    const { organizationId, connectionId, status, page, pageSize } = params;
    const where = {
      ...(organizationId ? { organizationId } : {}),
      ...(connectionId ? { connectionId } : {}),
      ...(status ? { status } : {})
    };

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

  /** Return the customer's open conversation on this bot, or open a new one. */
  async findOrCreateOpen(
    organizationId: string,
    customerId: string,
    connectionId: string,
    channel: Platform
  ) {
    return (
      (await this.prisma.conversation.findFirst({
        where: { customerId, connectionId, status: "OPEN" }
      })) ??
      (await this.prisma.conversation.create({
        data: { organizationId, customerId, connectionId, channel, status: "OPEN" }
      }))
    );
  }

  /** A conversation by id, but only if it belongs to the given org (else null). */
  findOwned(organizationId: string, id: string) {
    return this.prisma.conversation.findFirst({ where: { id, organizationId } });
  }

  async touch(id: string, at: Date) {
    await this.prisma.conversation.update({ where: { id }, data: { lastMessageAt: at } });
  }
}
