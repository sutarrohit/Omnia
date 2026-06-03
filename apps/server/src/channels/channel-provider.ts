import type { Platform } from "@/prisma/generated/client.js";
import type { ChannelAdapter } from "./channel-adapter.js";
import type { ConnectionContext } from "./types.js";

/**
 * Per-platform capability (how to talk to Telegram, WhatsApp, …). Registered
 * once per platform; it *manufactures* a per-connection {@link ChannelAdapter}
 * from a stored, decrypted {@link ConnectionContext}.
 *
 * Adding a channel = one ChannelProvider + one ChannelAdapter + one register()
 * line. Routes, services, DB, and the reply path stay untouched.
 */
export abstract class ChannelProvider {
  /** Registry key, e.g. `Platform.TELEGRAM`. */
  abstract readonly platform: Platform;

  /** Validate a raw credential from the frontend; return identity for storage. */
  abstract validateCredentials(raw: { token: string }): Promise<{
    externalId: string;
    displayName?: string;
  }>;

  /** Build a per-connection adapter (verify/parse/send) from a stored context. */
  abstract adapter(ctx: ConnectionContext): ChannelAdapter;

  /** Point the provider at our webhook URL (called on connection create). */
  abstract registerWebhook(ctx: ConnectionContext, webhookUrl: string): Promise<void>;

  /** Detach the webhook (called on delete/disable). */
  abstract unregisterWebhook(ctx: ConnectionContext): Promise<void>;
}
