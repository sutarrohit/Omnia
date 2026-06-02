import { createRouter } from "../../lib/create-app.js";
import { replyHandler } from "./conversations.handler.js";
import { replyRoute } from "./conversations.route.js";

export const conversationsRouter = createRouter().openapi(replyRoute, replyHandler);
