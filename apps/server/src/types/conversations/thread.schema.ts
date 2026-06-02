import { z } from "@hono/zod-openapi";
import { DateSchema } from "./common.schema.js";

/** Path params for `GET /api/v1/conversations/{id}/messages`. */
export const threadParamsSchema = z.object({ id: z.uuid() });

/** A single message in a conversation thread. */
export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  direction: z.string(),
  type: z.string(),
  content: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  channelMessageId: z.string().nullable(),
  status: z.string(),
  createdAt: DateSchema
});

/** Thread response: messages oldest first. */
export const threadResponseSchema = z.array(messageSchema);
