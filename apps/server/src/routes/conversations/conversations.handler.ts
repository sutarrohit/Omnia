import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  conversationService,
  messageService,
  realtimeHub,
  replyService
} from "../../lib/container.js";
import type { RealtimeEvent } from "../../lib/realtime.js";
import { ApiError } from "../../lib/api-error.js";
import type { AppBinding, AppRouteHandler } from "../../lib/types.js";
import type { listRoute, replyRoute, threadRoute } from "./conversations.route.js";

export const listHandler: AppRouteHandler<typeof listRoute> = async (c) => {
  const { status, page, pageSize } = c.req.valid("query");
  const { data, total } = await conversationService.list({
    organizationId: c.var.organizationId,
    status,
    page,
    pageSize
  });
  return c.json(
    {
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    },
    200
  );
};

export const threadHandler: AppRouteHandler<typeof threadRoute> = async (c) => {
  const { id } = c.req.valid("param");
  // Don't leak another org's messages.
  const owned = await conversationService.findOwned(c.var.organizationId, id);
  if (!owned) throw new ApiError(404, "NOT_FOUND", "Conversation not found");

  const messages = await messageService.listByConversation(id);
  return c.json(messages, 200);
};

export const replyHandler: AppRouteHandler<typeof replyRoute> = async (c) => {
  const { id } = c.req.valid("param");
  const { content } = c.req.valid("json");
  const msg = await replyService.reply(c.var.organizationId, id, content);
  return c.json({ id: msg.id, status: msg.status }, 201);
};

/**
 * SSE stream of live `message.created` events. Optional `?conversationId=` filters
 * to a single thread; otherwise streams the whole inbox. Plain Hono (not OpenAPI).
 */
export const streamHandler = (c: Context<AppBinding>) => {
  const conversationId = c.req.query("conversationId");
  const organizationId = c.var.organizationId;

  return streamSSE(c, async (stream) => {
    const queue: RealtimeEvent[] = [];
    let notify: (() => void) | null = null;

    const unsubscribe = realtimeHub.subscribe((event) => {
      if (event.organizationId !== organizationId) return; // tenant isolation
      if (conversationId && event.conversationId !== conversationId) return;
      queue.push(event);
      notify?.();
      notify = null;
    });

    stream.onAbort(() => {
      unsubscribe();
      notify?.(); // wake the loop so it can exit promptly
      notify = null;
    });

    try {
      while (!stream.aborted) {
        while (queue.length) {
          const event = queue.shift()!;
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        }
        // Wait for the next event, or wake every 25s to send a keep-alive ping.
        await Promise.race([new Promise<void>((resolve) => (notify = resolve)), stream.sleep(25_000)]);
        if (!queue.length && !stream.aborted) {
          await stream.writeSSE({ event: "ping", data: "{}" });
        }
      }
    } finally {
      unsubscribe();
    }
  });
};
