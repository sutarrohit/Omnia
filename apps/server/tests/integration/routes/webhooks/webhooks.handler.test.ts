import { describe, expect, it } from "vitest";
import app from "@/src/app.js";

// The webhook secret matches .env.test (TELEGRAM_WEBHOOK_SECRET).
const SECRET = "test-webhook-secret-1234567890";

function post(path: string, headers: Record<string, string>, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

describe("POST /webhooks/:channel", () => {
  it("404s an unknown channel", async () => {
    const res = await post("/webhooks/carrier-pigeon", {}, {});
    expect(res.status).toBe(404);
  });

  it("403s a telegram webhook with a missing/wrong secret token", async () => {
    const res = await post("/webhooks/telegram", {}, { update_id: 1 });
    expect(res.status).toBe(403);

    const wrong = await post(
      "/webhooks/telegram",
      { "x-telegram-bot-api-secret-token": "nope" },
      { update_id: 1 }
    );
    expect(wrong.status).toBe(403);
  });

  it("acks 200 for a verified update with no message (nothing to ingest)", async () => {
    const res = await post(
      "/webhooks/telegram",
      { "x-telegram-bot-api-secret-token": SECRET },
      { update_id: 1 } // no `message` -> parseInbound returns [], no DB access
    );
    expect(res.status).toBe(200);
  });
});
