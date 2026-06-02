import type { Platform, PrismaClient } from "@/prisma/generated/client.js";

export class CustomerService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Find the customer behind a channel identity, creating both if new. */
  async resolve(channel: Platform, channelUserId: string, displayName?: string) {
    const existing = await this.prisma.channelIdentity.findUnique({
      where: { channel_channelUserId: { channel, channelUserId } },
      include: { customer: true }
    });
    if (existing) return existing.customer;

    return this.prisma.customer.create({
      data: { displayName, identities: { create: { channel, channelUserId } } }
    });
  }
}
