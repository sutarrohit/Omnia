import { Platform } from "@/prisma/generated/client.js";
import type { Context } from "hono";
import type { AppBinding } from "../../lib/types.js";
import { connectionService, ingestService, providerRegistry } from "../../lib/container.js";

/** Map a webhook URL param (e.g. "telegram") to the Platform enum, or null. */
function toPlatform(param: string | undefined): Platform | null {
  if (!param) return null;
  const candidate = param.toUpperCase();
  return (Object.values(Platform) as string[]).includes(candidate)
    ? (candidate as Platform)
    : null;
}

/**
 * Inbound webhook for a specific bot: POST /webhooks/:channel/:connectionId.
 * Public (providers call it) — secured by the connection's per-bot secret.
 */
export async function handleWebhook(c: Context<AppBinding>) {
  const channel = toPlatform(c.req.param("channel"));
  if (!channel || !providerRegistry.has(channel)) {
    return c.json({ error: "unknown channel" }, 404);
  }

  const connectionId = c.req.param("connectionId");
  const connection = connectionId
    ? await connectionService.loadActiveForWebhook(connectionId, channel)
    : null;
  if (!connection) return c.json({ error: "unknown connection" }, 404);

  const ctx = connectionService.toContext(connection);
  const adapter = providerRegistry.get(channel).adapter(ctx);

  const body = await c.req.json().catch(() => ({}));
  const headers = Object.fromEntries(
    [...c.req.raw.headers].map(([k, v]) => [k.toLowerCase(), v])
  );

  if (!adapter.verifyWebhook({ headers, body })) {
    return c.json({ error: "forbidden" }, 403);
  }

  try {
    for (const msg of adapter.parseInbound(body)) {
      await ingestService.ingest(msg, ctx);
    }
  } catch (err) {
    c.var.logger.error({ err, channel, connectionId }, "webhook processing failed");
    // still ack 200 — avoid provider retry storms
  }
  return c.body(null, 200);
}
