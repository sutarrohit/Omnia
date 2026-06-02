import type { Platform } from "@/prisma/generated/client.js";
import type { ChannelAdapter } from "./channel-adapter.js";

/** Holds the registered channel adapters and resolves them by `Platform`. */
export class ChannelRegistry {
  private readonly adapters = new Map<Platform, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.channel)) {
      throw new Error(`Adapter already registered: ${adapter.channel}`);
    }
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: Platform): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) throw new Error(`Unknown channel: ${channel}`);
    return adapter;
  }

  has(channel: Platform): boolean {
    return this.adapters.has(channel);
  }
}
