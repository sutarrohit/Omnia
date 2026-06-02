import { z } from "@hono/zod-openapi";

/** Accepts either an ISO string or a Date (Prisma returns Date; JSON gives string). */
export const DateSchema = z.union([z.string(), z.date()]);
