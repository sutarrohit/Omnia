import { z } from "@hono/zod-openapi";
import { DateSchema } from "../conversations/common.schema.js";

/** A connected bot as returned in the org's connection list (safe fields). */
export const connectionListItemSchema = z.object({
  id: z.string(),
  platform: z.string(),
  externalId: z.string(),
  displayName: z.string().nullable(),
  status: z.string(),
  createdAt: DateSchema
});

export const listConnectionsResponseSchema = z.array(connectionListItemSchema);
