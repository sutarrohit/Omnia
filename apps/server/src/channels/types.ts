import type { Platform } from "@/prisma/generated/client.js";

/**
 * Channel-agnostic shape of an inbound message. Every adapter's `parseInbound`
 * turns a provider-specific payload into zero or more of these — services only
 * ever see this normalized form.
 */
export interface NormalizedInboundMessage {
  channel: Platform;
  channelUserId: string; // who sent it, in the platform's ID scheme
  channelMessageId: string; // platform's unique message id (dedupe key)
  type: "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "VIDEO";
  content?: string;
  mediaUrl?: string;
  senderName?: string;
  timestamp: Date;
  raw: unknown; // untouched original payload
}

/** A message to deliver out to a channel. Extend the union as we add types. */
export interface OutboundMessage {
  type: "TEXT";
  content: string;
}

/** Result of a successful send — the provider's id for the delivered message. */
export interface SendResult {
  channelMessageId: string;
}

/** Minimal view of an incoming webhook request an adapter needs to verify it. */
export interface WebhookRequest {
  headers: Record<string, string | undefined>;
  body: unknown;
}
