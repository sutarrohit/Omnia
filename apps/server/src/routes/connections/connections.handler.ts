import { connectionService } from "../../lib/container.js";
import type { AppRouteHandler } from "../../lib/types.js";
import type {
  createConnectionRoute,
  listConnectionsRoute,
  removeConnectionRoute
} from "./connections.route.js";

export const createConnectionHandler: AppRouteHandler<typeof createConnectionRoute> = async (c) => {
  const { platform, token } = c.req.valid("json");
  const conn = await connectionService.create(c.var.organizationId, platform, token);
  return c.json(
    { id: conn.id, platform: conn.platform, displayName: conn.displayName, status: conn.status },
    201
  );
};

export const listConnectionsHandler: AppRouteHandler<typeof listConnectionsRoute> = async (c) => {
  const data = await connectionService.list(c.var.organizationId);
  return c.json(data, 200);
};

export const removeConnectionHandler: AppRouteHandler<typeof removeConnectionRoute> = async (c) => {
  const { id } = c.req.valid("param");
  await connectionService.remove(c.var.organizationId, id);
  return c.json({ success: true }, 200);
};
