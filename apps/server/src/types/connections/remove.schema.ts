import { z } from "@hono/zod-openapi";

/** Path params for `DELETE /api/v1/connections/{id}`. */
export const removeConnectionParamsSchema = z.object({ id: z.uuid() });

export const removeConnectionResponseSchema = z.object({ success: z.boolean() });
