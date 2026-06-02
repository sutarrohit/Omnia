import { z } from "@hono/zod-openapi";
import { DateSchema } from "./common.schema.js";

/** Query params for `GET /api/v1/conversations`. */
export const listQuerySchema = z.object({
  status: z.enum(["OPEN", "PENDING", "CLOSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

/** A single conversation row as returned in the inbox list. */
export const conversationListItemSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  channel: z.string(),
  status: z.string(),
  assignedAgentId: z.string().nullable(),
  lastMessageAt: DateSchema.nullable(),
  createdAt: DateSchema,
  customer: z.object({ id: z.string(), displayName: z.string().nullable() }),
  messages: z.array(
    z.object({
      id: z.string(),
      content: z.string().nullable(),
      direction: z.string(),
      createdAt: DateSchema
    })
  )
});

/** Paginated response for the inbox list. */
export const listResponseSchema = z.object({
  data: z.array(conversationListItemSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number()
  })
});
