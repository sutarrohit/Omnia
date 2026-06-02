import env from "../env.js";
import { ChannelRegistry } from "./channel-registry.js";
import { TelegramAdapter } from "./telegram/telegram-adapter.js";

/** Build the registry with every channel adapter registered. */
export function buildChannelRegistry(): ChannelRegistry {
  const registry = new ChannelRegistry();
  registry.register(new TelegramAdapter(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_WEBHOOK_SECRET));
  // registry.register(new WhatsAppAdapter(...));  // later
  return registry;
}
