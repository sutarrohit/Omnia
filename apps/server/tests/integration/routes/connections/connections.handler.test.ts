import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/src/auth.js";
import { connectionService } from "@/src/lib/container.js";
import app from "@/src/app.js";

const authed = { user: { id: "user-1" }, session: { activeOrganizationId: "org-1" } };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(auth.api, "getSession").mockResolvedValue(authed as never);
});

function postConnection(body: unknown) {
  return app.request("/api/v1/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/v1/connections", () => {
  it("401s without a session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null as never);
    const res = await postConnection({ platform: "TELEGRAM", token: "123:abc" });
    expect(res.status).toBe(401);
  });

  it("422s on an invalid body (missing token)", async () => {
    const res = await postConnection({ platform: "TELEGRAM" });
    expect(res.status).toBe(422);
  });

  it("201s and returns safe fields on success", async () => {
    const createSpy = vi.spyOn(connectionService, "create").mockResolvedValue({
      id: "conn-1",
      platform: "TELEGRAM",
      displayName: "mybot",
      status: "ACTIVE"
    } as never);

    const res = await postConnection({ platform: "TELEGRAM", token: "123:abc" });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "conn-1", displayName: "mybot", status: "ACTIVE" });
    expect(createSpy).toHaveBeenCalledWith("org-1", "TELEGRAM", "123:abc");
  });
});

describe("GET /api/v1/connections", () => {
  it("lists connections for the active org", async () => {
    const listSpy = vi.spyOn(connectionService, "list").mockResolvedValue([] as never);
    const res = await app.request("/api/v1/connections");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(listSpy).toHaveBeenCalledWith("org-1");
  });
});
