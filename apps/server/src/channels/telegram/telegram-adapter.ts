import { Platform } from "@/prisma/generated/client.js";
import { ChannelAdapter } from "../channel-adapter.js";
import type {
  NormalizedInboundMessage,
  OutboundMessage,
  SendResult,
  WebhookRequest
} from "../types.js";
import type { TelegramUpdate } from "./telegram.types.js";

export class TelegramAdapter extends ChannelAdapter {
  readonly channel = Platform.TELEGRAM;

  constructor(
    private readonly botToken: string,
    private readonly webhookSecret: string
  ) {
    super();
  }

  private get apiBase() {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  verifyWebhook(req: WebhookRequest): boolean {
    return req.headers["x-telegram-bot-api-secret-token"] === this.webhookSecret;
  }

  parseInbound(payload: unknown): NormalizedInboundMessage[] {
    const msg = (payload as TelegramUpdate).message;
    if (!msg) return []; // ignore non-message updates for now

    return [
      {
        channel: this.channel,
        channelUserId: String(msg.chat.id),
        channelMessageId: String(msg.message_id),
        type: msg.text ? "TEXT" : msg.photo ? "IMAGE" : "TEXT",
        content: msg.text,
        senderName: msg.from?.first_name ?? msg.from?.username,
        timestamp: new Date(msg.date * 1000),
        raw: payload
      }
    ];
  }

  async sendMessage(channelUserId: string, message: OutboundMessage): Promise<SendResult> {
    const res = await fetch(`${this.apiBase}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelUserId, text: message.content })
    });
    const data = (await res.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };
    if (!data.ok || !data.result) {
      throw new Error(`Telegram send failed: ${data.description ?? "unknown"}`);
    }
    return { channelMessageId: String(data.result.message_id) };
  }
}
