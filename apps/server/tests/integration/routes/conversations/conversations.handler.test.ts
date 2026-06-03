import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/src/auth.js";
import app from "@/src/app.js";

const authed = { user: { id: "user-1" }, session: { activeOrganizationId: "org-1" } };

beforeEach(() => {
  vi.restoreAllMocks();
  // Conversation routes require auth — pretend we're signed in with an active org.
  vi.spyOn(auth.api, "getSession").mockResolvedValue(authed as never);
});

function postReply(id: string, body: unknown) {
  return app.request(`/api/v1/conversations/${id}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("conversations OpenAPI document", () => {
  it("registers list, thread, and reply paths", async () => {
    const res = await app.request("/doc");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(doc.paths["/api/v1/conversations"]).toBeDefined();
    expect(doc.paths["/api/v1/conversations/{id}/messages"]).toBeDefined();
    expect(doc.paths["/api/v1/conversations/{id}/reply"]).toBeDefined();
  });
});

describe("auth", () => {
  it("401s the inbox when there is no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null as never);
    const res = await app.request("/api/v1/conversations");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/conversations (list)", () => {
  it("422s on an invalid status filter", async () => {
    const res = await app.request("/api/v1/conversations?status=BOGUS");
    expect(res.status).toBe(422);
  });
});

describe("GET /api/v1/conversations/{id}/messages (thread)", () => {
  it("422s when the id is not a uuid", async () => {
    const res = await app.request("/api/v1/conversations/not-a-uuid/messages");
    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/conversations/{id}/reply", () => {
  it("422s when content is empty", async () => {
    const res = await postReply("11111111-1111-1111-1111-111111111111", { content: "" });
    expect(res.status).toBe(422);
  });

  it("422s when the id is not a uuid", async () => {
    const res = await postReply("not-a-uuid", { content: "hi" });
    expect(res.status).toBe(422);
  });
});
