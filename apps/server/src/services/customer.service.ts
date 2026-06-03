import type { Platform, PrismaClient } from "@/prisma/generated/client.js";

export class CustomerService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Find the customer behind a per-bot channel identity, creating both if new.
   * Identity is keyed by `(connectionId, channelUserId)` — the same person on two
   * different bots is two identities (and, for now, two customers).
   */
  async resolve(
    organizationId: string,
    connectionId: string,
    channel: Platform,
    channelUserId: string,
    displayName?: string
  ) {
    const existing = await this.prisma.channelIdentity.findUnique({
      where: { connectionId_channelUserId: { connectionId, channelUserId } },
      include: { customer: true }
    });
    if (existing) return existing.customer;

    return this.prisma.customer.create({
      data: {
        organizationId,
        displayName,
        identities: { create: { connectionId, channel, channelUserId } }
      }
    });
  }
}
