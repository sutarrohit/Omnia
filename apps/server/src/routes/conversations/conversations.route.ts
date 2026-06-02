import { createRoute, z } from "@hono/zod-openapi";

export const replyRoute = createRoute({
  method: "post",
  path: "/{id}/reply",
  tags: ["Conversations"],
  request: {
    params: z.object({ id: z.uuid() }),
    body: {
      content: {
        "application/json": { schema: z.object({ content: z.string().min(1) }) }
      }
    }
  },
  responses: {
    201: {
      description: "Reply sent",
      content: {
        "application/json": {
          schema: z.object({ id: z.string(), status: z.string() })
        }
      }
    }
  }
});
