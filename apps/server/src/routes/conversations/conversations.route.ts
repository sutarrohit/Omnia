import { createRoute } from "@hono/zod-openapi";
import { listQuerySchema, listResponseSchema } from "../../types/conversations/list.schema.js";
import {
  threadParamsSchema,
  threadResponseSchema
} from "../../types/conversations/thread.schema.js";
import {
  replyBodySchema,
  replyParamsSchema,
  replyResponseSchema
} from "../../types/conversations/reply.schema.js";

export const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Conversations"],
  request: {
    query: listQuerySchema
  },
  responses: {
    200: {
      description: "Paginated list of conversations, newest activity first",
      content: {
        "application/json": { schema: listResponseSchema }
      }
    }
  }
});

export const threadRoute = createRoute({
  method: "get",
  path: "/{id}/messages",
  tags: ["Conversations"],
  request: {
    params: threadParamsSchema
  },
  responses: {
    200: {
      description: "Messages in the conversation, oldest first",
      content: {
        "application/json": { schema: threadResponseSchema }
      }
    }
  }
});

export const replyRoute = createRoute({
  method: "post",
  path: "/{id}/reply",
  tags: ["Conversations"],
  request: {
    params: replyParamsSchema,
    body: {
      content: {
        "application/json": { schema: replyBodySchema }
      }
    }
  },
  responses: {
    201: {
      description: "Reply sent",
      content: {
        "application/json": { schema: replyResponseSchema }
      }
    }
  }
});
