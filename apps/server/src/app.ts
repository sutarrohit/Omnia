import createApp from "./lib/create-app.js";
import { configureOpenAPI } from "./lib/configure-open-api.js";
import demoRoutes from "./routes/demo/index.js";

import type { Context } from "hono";
import type { AppBinding } from "./lib/types.js";

const app = createApp();
configureOpenAPI(app);

app.get("/health", (c: Context<AppBinding>) => {
  return c.json({
    status: "ok"
  });
});

// Mount feature routes with full paths preserved in types
const routes = app.route("/api/v1", demoRoutes);

export type AppType = typeof routes;
export default routes;
