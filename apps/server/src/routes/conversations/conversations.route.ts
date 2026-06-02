import { createRoute, z } from "@hono/zod-openapi";

const DateSchema = z.union([z.string(), z.date()]);

const ConversationListItemSchema = z.object({
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

const MessageSchema = z.object({
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

export const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Conversations"],
  request: {
    query: z.object({
      status: z.enum(["OPEN", "PENDING", "CLOSED"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20)
    })
  },
  responses: {
    200: {
      description: "Paginated list of conversations, newest activity first",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(ConversationListItemSchema),
            pagination: z.object({
              page: z.number(),
              pageSize: z.number(),
              total: z.number(),
              totalPages: z.number()
            })
          })
        }
      }
    }
  }
});

export const threadRoute = createRoute({
  method: "get",
  path: "/{id}/messages",
  tags: ["Conversations"],
  request: {
    params: z.object({ id: z.uuid() })
  },
  responses: {
    200: {
      description: "Messages in the conversation, oldest first",
      content: {
        "application/json": { schema: z.array(MessageSchema) }
      }
    }
  }
});

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
