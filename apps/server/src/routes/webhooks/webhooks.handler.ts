import { Platform } from "@/prisma/generated/client.js";
import type { Context } from "hono";
import type { AppBinding } from "../../lib/types.js";
import { channelRegistry, ingestService } from "../../lib/container.js";

/** Map a webhook URL param (e.g. "telegram") to the Platform enum, or null. */
function toPlatform(param: string | undefined): Platform | null {
  if (!param) return null;
  const candidate = param.toUpperCase();
  return (Object.values(Platform) as string[]).includes(candidate)
    ? (candidate as Platform)
    : null;
}

export async function handleWebhook(c: Context<AppBinding>) {
  const channel = toPlatform(c.req.param("channel"));
  if (!channel || !channelRegistry.has(channel)) {
    return c.json({ error: "unknown channel" }, 404);
  }

  const adapter = channelRegistry.get(channel);
  const body = await c.req.json().catch(() => ({}));
  const headers = Object.fromEntries(
    [...c.req.raw.headers].map(([k, v]) => [k.toLowerCase(), v])
  );

  if (!adapter.verifyWebhook({ headers, body })) {
    return c.json({ error: "forbidden" }, 403);
  }

  try {
    for (const msg of adapter.parseInbound(body)) {
      await ingestService.ingest(msg);
    }
  } catch (err) {
    c.var.logger.error({ err, channel }, "webhook processing failed");
    // still ack 200 — avoid provider retry storms
  }
  return c.body(null, 200);
}
