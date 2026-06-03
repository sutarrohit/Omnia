import { randomBytes } from "node:crypto";
import type { ChannelConnection, Platform, PrismaClient } from "@/prisma/generated/client.js";
import type { ChannelAdapter } from "../channels/channel-adapter.js";
import type { ProviderRegistry } from "../channels/provider-registry.js";
import type { ConnectionContext } from "../channels/types.js";
import { ApiError } from "../lib/api-error.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import env from "../env.js";

/** Fields safe to expose to the frontend — never the token or webhook secret. */
const SAFE_SELECT = {
  id: true,
  platform: true,
  externalId: true,
  displayName: true,
  status: true,
  createdAt: true
} as const;

export class ConnectionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly providers: ProviderRegistry
  ) {}

  /** Decrypt a stored connection into an in-memory context (token in memory only). */
  toContext(conn: ChannelConnection): ConnectionContext {
    return {
      id: conn.id,
      organizationId: conn.organizationId,
      platform: conn.platform,
      externalId: conn.externalId,
      token: decrypt(conn.encryptedToken),
      webhookSecret: conn.webhookSecret,
      meta: conn.meta ?? undefined
    };
  }

  /** Build the per-connection adapter (verify/parse/send) for a stored connection. */
  adapter(conn: ChannelConnection): ChannelAdapter {
    return this.providers.get(conn.platform).adapter(this.toContext(conn));
  }

  /** Validate a token, store it encrypted, and register the provider's webhook. */
  async create(organizationId: string, platform: Platform, rawToken: string) {
    const provider = this.providers.get(platform); // throws on unknown platform
    const { externalId, displayName } = await provider.validateCredentials({ token: rawToken });

    const existing = await this.prisma.channelConnection.findUnique({
      where: { platform_externalId: { platform, externalId } }
    });
    if (existing) throw new ApiError(409, "ALREADY_CONNECTED", "This bot is already connected");

    const conn = await this.prisma.channelConnection.create({
      data: {
        organizationId,
        platform,
        externalId,
        displayName,
        encryptedToken: encrypt(rawToken),
        webhookSecret: randomBytes(24).toString("hex")
      }
    });

    const webhookUrl = `${env.PUBLIC_URL}/webhooks/${platform.toLowerCase()}/${conn.id}`;
    try {
      await provider.registerWebhook(this.toContext(conn), webhookUrl);
    } catch (err) {
      // A connection that never registered isn't a connection — roll back.
      await this.prisma.channelConnection.delete({ where: { id: conn.id } });
      throw new ApiError(
        502,
        "WEBHOOK_FAILED",
        err instanceof Error ? err.message : "Failed to register webhook"
      );
    }

    return conn;
  }

  /** Safe list for an org. */
  list(organizationId: string) {
    return this.prisma.channelConnection.findMany({
      where: { organizationId },
      select: SAFE_SELECT,
      orderBy: { createdAt: "desc" }
    });
  }

  /** Load an active connection for an inbound webhook, asserting the platform. */
  async loadActiveForWebhook(connectionId: string, platform: Platform) {
    const conn = await this.prisma.channelConnection.findUnique({ where: { id: connectionId } });
    if (!conn || conn.platform !== platform || conn.status !== "ACTIVE") return null;
    return conn;
  }

  /** Remove a connection (org-scoped): best-effort unregister, then delete. */
  async remove(organizationId: string, id: string) {
    const conn = await this.prisma.channelConnection.findUnique({ where: { id } });
    if (!conn || conn.organizationId !== organizationId) {
      throw new ApiError(404, "NOT_FOUND", "Connection not found");
    }
    try {
      await this.providers.get(conn.platform).unregisterWebhook(this.toContext(conn));
    } catch {
      // best-effort detach — proceed with the delete regardless
    }
    await this.prisma.channelConnection.delete({ where: { id } });
  }
}
