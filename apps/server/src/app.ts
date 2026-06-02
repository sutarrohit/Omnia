import createApp from "./lib/create-app.js";
import { configureOpenAPI } from "./lib/configure-open-api.js";
import { webhooksRouter } from "./routes/webhooks/index.js";
import { conversationsRouter } from "./routes/conversations/index.js";
import { auth } from "./auth.js";

import type { Context } from "hono";
import type { AppBinding } from "./lib/types.js";

const app = createApp();
configureOpenAPI(app);

app.get("/health", (c: Context<AppBinding>) => {
  return c.json({
    status: "ok"
  });
});

// Better Auth handles all /api/auth/* routes (sign-up/in/out, session, organization).
// Unversioned and mounted outside the OpenAPI feature routes.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// External webhook endpoints live at the root (unversioned), like /health.
app.route("/webhooks", webhooksRouter);

// Versioned feature routes.
app.route("/api/v1/conversations", conversationsRouter);

export type AppType = typeof app;
export default app;
