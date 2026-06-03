import { createRouter } from "../../lib/create-app.js";
import { requireAuth } from "../../middlewares/auth.js";
import {
  listHandler,
  replyHandler,
  streamHandler,
  threadHandler
} from "./conversations.handler.js";
import { listRoute, replyRoute, threadRoute } from "./conversations.route.js";

export const conversationsRouter = createRouter();

// Every conversation route requires a signed-in user with an active organization.
conversationsRouter.use("*", requireAuth);

// Realtime SSE stream (plain Hono route — not part of the OpenAPI spec).
conversationsRouter.get("/stream", streamHandler);

conversationsRouter
  .openapi(listRoute, listHandler)
  .openapi(threadRoute, threadHandler)
  .openapi(replyRoute, replyHandler);
