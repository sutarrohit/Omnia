import { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi";
import { PinoLogger } from "hono-pino";
import type { Auth } from "../auth.js";

type SessionUser = Auth["$Infer"]["Session"]["user"];

export interface AppBinding {
  Variables: {
    logger: PinoLogger;
    // Set by the auth middleware on protected routes (/api/v1/*).
    user: SessionUser;
    organizationId: string;
  };
}

export type AppOpenAPI = OpenAPIHono<AppBinding>;
export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppBinding>;
