import { createRouter } from "../../lib/create-app.js";
import { requireAuth } from "../../middlewares/auth.js";
import {
  createConnectionHandler,
  listConnectionsHandler,
  removeConnectionHandler
} from "./connections.handler.js";
import {
  createConnectionRoute,
  listConnectionsRoute,
  removeConnectionRoute
} from "./connections.route.js";

export const connectionsRouter = createRouter();

// All connection routes require a signed-in user with an active organization.
connectionsRouter.use("*", requireAuth);

connectionsRouter
  .openapi(createConnectionRoute, createConnectionHandler)
  .openapi(listConnectionsRoute, listConnectionsHandler)
  .openapi(removeConnectionRoute, removeConnectionHandler);
