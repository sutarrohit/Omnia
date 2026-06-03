import type { MiddlewareHandler } from "hono";
import { auth } from "../auth.js";
import { ApiError } from "../lib/api-error.js";
import { prisma } from "../lib/prisma.js";
import type { AppBinding } from "../lib/types.js";

/**
 * Gate protected routes on a better-auth session and resolve the active tenant.
 *
 * Sets `c.var.user` and `c.var.organizationId`. The org comes from
 * `session.activeOrganizationId` (defaulted by the session-create hook); we fall
 * back to the user's first membership because the very first session created at
 * sign-up has no active org yet (the membership is created just after).
 *
 * This is the seam where real auth lives — swap the provider, not the callers.
 */
export const requireAuth: MiddlewareHandler<AppBinding> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");

  let organizationId = session.session.activeOrganizationId ?? null;
  if (!organizationId) {
    const member = await prisma.member.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" }
    });
    organizationId = member?.organizationId ?? null;
  }
  if (!organizationId) {
    throw new ApiError(403, "NO_ORGANIZATION", "No active organization for this user");
  }

  c.set("user", session.user);
  c.set("organizationId", organizationId);
  await next();
};
