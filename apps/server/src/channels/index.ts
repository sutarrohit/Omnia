import { ProviderRegistry } from "./provider-registry.js";
import { TelegramProvider } from "./telegram/telegram-provider.js";

/** Build the registry with every channel provider registered (once per platform). */
export function buildProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new TelegramProvider());
  // registry.register(new WhatsAppProvider());  // <- the entire cost of a new channel
  return registry;
}
