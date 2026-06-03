import { Hono } from "hono";
import type { AppBinding } from "../../lib/types.js";
import { handleWebhook } from "./webhooks.handler.js";

export const webhooksRouter = new Hono<AppBinding>();
webhooksRouter.post("/:channel/:connectionId", handleWebhook);
