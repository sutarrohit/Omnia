import type { Platform } from "@/prisma/generated/client.js";
import type {
  NormalizedInboundMessage,
  OutboundMessage,
  SendResult,
  WebhookRequest
} from "./types.js";

/**
 * The contract every channel implements. Adding a new channel means writing one
 * subclass of this and registering it — routes, services, DB, and the reply
 * path stay untouched.
 */
export abstract class ChannelAdapter {
  /** Unique channel id (registry key), e.g. `Platform.TELEGRAM`. */
  abstract readonly channel: Platform;

  /** Validate the webhook is genuinely from the provider. */
  abstract verifyWebhook(req: WebhookRequest): boolean;

  /** Provider payload -> zero or more normalized messages. */
  abstract parseInbound(payload: unknown): NormalizedInboundMessage[];

  /** Deliver an outbound message to a recipient on this channel. */
  abstract sendMessage(channelUserId: string, message: OutboundMessage): Promise<SendResult>;
}
