import type { Platform } from "@/prisma/generated/client.js";
import type { ChannelProvider } from "./channel-provider.js";

/**
 * Holds one {@link ChannelProvider} per platform and resolves it by `Platform`.
 * Capability is per-platform; the individual bots (instances) are DB rows.
 */
export class ProviderRegistry {
  private readonly providers = new Map<Platform, ChannelProvider>();

  register(provider: ChannelProvider): void {
    if (this.providers.has(provider.platform)) {
      throw new Error(`Provider already registered: ${provider.platform}`);
    }
    this.providers.set(provider.platform, provider);
  }

  get(platform: Platform): ChannelProvider {
    const provider = this.providers.get(platform);
    if (!provider) throw new Error(`Unknown platform: ${platform}`);
    return provider;
  }

  has(platform: Platform): boolean {
    return this.providers.has(platform);
  }
}
