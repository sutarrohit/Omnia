import { replyService } from "../../lib/container.js";
import type { AppRouteHandler } from "../../lib/types.js";
import type { replyRoute } from "./conversations.route.js";

export const replyHandler: AppRouteHandler<typeof replyRoute> = async (c) => {
  const { id } = c.req.valid("param");
  const { content } = c.req.valid("json");
  const msg = await replyService.reply(id, content);
  return c.json({ id: msg.id, status: msg.status }, 201);
};
