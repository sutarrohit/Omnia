import { Platform } from "@/prisma/generated/client.js";
import { describe, expect, it } from "vitest";
import { TelegramAdapter } from "@/src/channels/telegram/telegram-adapter.js";
import type { TelegramUpdate } from "@/src/channels/telegram/telegram.types.js";

const adapter = new TelegramAdapter("test-token", "test-webhook-secret-1234567890");

describe("TelegramAdapter.parseInbound", () => {
  it("normalizes a text message update", () => {
    const update: TelegramUpdate = {
      update_id: 100,
      message: {
        message_id: 42,
        from: { id: 7, first_name: "Ada", username: "ada_l" },
        chat: { id: 12345, type: "private" },
        date: 1_700_000_000,
        text: "hello there"
      }
    };

    const result = adapter.parseInbound(update);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      channel: Platform.TELEGRAM,
      channelUserId: "12345",
      channelMessageId: "42",
      type: "TEXT",
      content: "hello there",
      senderName: "Ada",
      timestamp: new Date(1_700_000_000 * 1000),
      raw: update
    });
  });

  it("classifies a photo-only message as IMAGE", () => {
    const update: TelegramUpdate = {
      update_id: 101,
      message: {
        message_id: 43,
        chat: { id: 12345, type: "private" },
        date: 1_700_000_001,
        photo: [{ file_id: "abc" }]
      }
    };

    const [msg] = adapter.parseInbound(update);
    expect(msg?.type).toBe("IMAGE");
    expect(msg?.content).toBeUndefined();
  });

  it("falls back to username when first_name is absent", () => {
    const update: TelegramUpdate = {
      update_id: 102,
      message: {
        message_id: 44,
        from: { id: 7, username: "ada_l" },
        chat: { id: 12345, type: "private" },
        date: 1_700_000_002,
        text: "hi"
      }
    };

    expect(adapter.parseInbound(update)[0]?.senderName).toBe("ada_l");
  });

  it("returns an empty array for non-message updates", () => {
    expect(adapter.parseInbound({ update_id: 103 })).toEqual([]);
  });
});

describe("TelegramAdapter.verifyWebhook", () => {
  it("accepts a matching secret-token header", () => {
    expect(
      adapter.verifyWebhook({
        headers: { "x-telegram-bot-api-secret-token": "test-webhook-secret-1234567890" },
        body: {}
      })
    ).toBe(true);
  });

  it("rejects a missing or wrong secret-token header", () => {
    expect(adapter.verifyWebhook({ headers: {}, body: {} })).toBe(false);
    expect(
      adapter.verifyWebhook({ headers: { "x-telegram-bot-api-secret-token": "nope" }, body: {} })
    ).toBe(false);
  });
});
