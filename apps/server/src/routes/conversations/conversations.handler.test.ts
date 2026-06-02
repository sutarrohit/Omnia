import { describe, expect, it } from "vitest";
import app from "../../app.js";

function postReply(id: string, body: unknown) {
  return app.request(`/api/v1/conversations/${id}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/v1/conversations/{id}/reply", () => {
  it("is registered in the OpenAPI document", async () => {
    const res = await app.request("/doc");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(doc.paths["/api/v1/conversations/{id}/reply"]).toBeDefined();
  });

  it("422s when content is empty", async () => {
    const res = await postReply("11111111-1111-1111-1111-111111111111", { content: "" });
    expect(res.status).toBe(422);
  });

  it("422s when the id is not a uuid", async () => {
    const res = await postReply("not-a-uuid", { content: "hi" });
    expect(res.status).toBe(422);
  });
});
