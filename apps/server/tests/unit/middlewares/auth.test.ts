import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/src/auth.js";
import { prisma } from "@/src/lib/prisma.js";
import type { AppBinding } from "@/src/lib/types.js";
import { requireAuth } from "@/src/middlewares/auth.js";
import onError from "@/src/middlewares/on-error.js";

function makeApp() {
  const app = new Hono<AppBinding>();
  app.onError(onError);
  app.use("*", requireAuth);
  app.get("/whoami", (c) => c.json({ organizationId: c.var.organizationId, userId: c.var.user.id }));
  return app;
}

beforeEach(() => vi.restoreAllMocks());

describe("requireAuth", () => {
  it("401s when there is no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null as never);
    const res = await makeApp().request("/whoami");
    expect(res.status).toBe(401);
  });

  it("uses session.activeOrganizationId when present", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "u" },
      session: { activeOrganizationId: "org-active" }
    } as never);
    const res = await makeApp().request("/whoami");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ organizationId: "org-active", userId: "u" });
  });

  it("falls back to the first membership when no active org (first session at sign-up)", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "u" },
      session: { activeOrganizationId: null }
    } as never);
    vi.spyOn(prisma.member, "findFirst").mockResolvedValue({ organizationId: "org-fallback" } as never);
    const res = await makeApp().request("/whoami");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ organizationId: "org-fallback" });
  });

  it("403s when the user belongs to no organization", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "u" },
      session: { activeOrganizationId: null }
    } as never);
    vi.spyOn(prisma.member, "findFirst").mockResolvedValue(null as never);
    const res = await makeApp().request("/whoami");
    expect(res.status).toBe(403);
  });
});
