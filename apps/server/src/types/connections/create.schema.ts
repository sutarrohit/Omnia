import { z } from "@hono/zod-openapi";
import { Platform } from "@/prisma/generated/client.js";

/** Request body for `POST /api/v1/connections`. */
export const createConnectionBodySchema = z.object({
  platform: z.nativeEnum(Platform),
  token: z.string().min(1)
});

/** Response after a bot is connected (safe fields only — never token/secret). */
export const createConnectionResponseSchema = z.object({
  id: z.string(),
  platform: z.string(),
  displayName: z.string().nullable(),
  status: z.string()
});
