import { z } from "@hono/zod-openapi";

/** Path params for `POST /api/v1/conversations/{id}/reply`. */
export const replyParamsSchema = z.object({ id: z.uuid() });

/** Request body for sending a reply. */
export const replyBodySchema = z.object({ content: z.string().min(1) });

/** Response after a reply is queued/sent. */
export const replyResponseSchema = z.object({ id: z.string(), status: z.string() });
