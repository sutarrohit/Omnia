import { Platform } from "@/prisma/generated/client.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionContext } from "@/src/channels/types.js";
import { connectionService } from "@/src/lib/container.js";
import app from "@/src/app.js";

const SECRET = "test-webhook-secret-1234567890";
const CONN_ID = "11111111-1111-1111-1111-111111111111";

const ctx: ConnectionContext = {
  id: CONN_ID,
  organizationId: "org-1",
  platform: Platform.TELEGRAM,
  externalId: "bot-1",
  token: "bot-token",
  webhookSecret: SECRET
};

// Keep the route DB-free: stub the connection lookup/decryption. The real
// TelegramProvider/adapter then run unchanged (no network for verify/parse).
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(connectionService, "loadActiveForWebhook").mockImplementation(async (id, platform) =>
    id === CONN_ID && String(platform) === Platform.TELEGRAM ? ({ id: CONN_ID } as never) : null
  );
  vi.spyOn(connectionService, "toContext").mockReturnValue(ctx);
});

function post(path: string, headers: Record<string, string>, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

describe("POST /webhooks/:channel/:connectionId", () => {
  it("404s an unknown channel", async () => {
    const res = await post(`/webhooks/carrier-pigeon/${CONN_ID}`, {}, {});
    expect(res.status).toBe(404);
  });

  it("404s an unknown connection", async () => {
    const res = await post(
      "/webhooks/telegram/99999999-9999-9999-9999-999999999999",
      { "x-telegram-bot-api-secret-token": SECRET },
      { update_id: 1 }
    );
    expect(res.status).toBe(404);
  });

  it("403s a telegram webhook with a missing/wrong secret token", async () => {
    const res = await post(`/webhooks/telegram/${CONN_ID}`, {}, { update_id: 1 });
    expect(res.status).toBe(403);

    const wrong = await post(
      `/webhooks/telegram/${CONN_ID}`,
      { "x-telegram-bot-api-secret-token": "nope" },
      { update_id: 1 }
    );
    expect(wrong.status).toBe(403);
  });

  it("acks 200 for a verified update with no message (nothing to ingest)", async () => {
    const res = await post(
      `/webhooks/telegram/${CONN_ID}`,
      { "x-telegram-bot-api-secret-token": SECRET },
      { update_id: 1 } // no `message` -> parseInbound returns [], no DB access
    );
    expect(res.status).toBe(200);
  });
});
