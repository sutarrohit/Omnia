import { Platform } from "@/prisma/generated/client.js";
import { ApiError } from "../../lib/api-error.js";
import { ChannelProvider } from "../channel-provider.js";
import type { ConnectionContext } from "../types.js";
import { TelegramAdapter } from "./telegram-adapter.js";

interface GetMeResponse {
  ok: boolean;
  result?: { id: number; username?: string };
  description?: string;
}

interface OkResponse {
  ok: boolean;
  description?: string;
}

export class TelegramProvider extends ChannelProvider {
  readonly platform = Platform.TELEGRAM;

  async validateCredentials({ token }: { token: string }) {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as GetMeResponse;
    if (!data.ok || !data.result) {
      throw new ApiError(400, "INVALID_TOKEN", "Invalid Telegram bot token");
    }
    return { externalId: String(data.result.id), displayName: data.result.username };
  }

  adapter(ctx: ConnectionContext): TelegramAdapter {
    return new TelegramAdapter(ctx.token, ctx.webhookSecret);
  }

  async registerWebhook(ctx: ConnectionContext, webhookUrl: string): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${ctx.token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: ctx.webhookSecret })
    });
    const data = (await res.json()) as OkResponse;
    if (!data.ok) throw new Error(`setWebhook failed: ${data.description ?? "unknown"}`);
  }

  async unregisterWebhook(ctx: ConnectionContext): Promise<void> {
    await fetch(`https://api.telegram.org/bot${ctx.token}/deleteWebhook`, { method: "POST" });
  }
}
