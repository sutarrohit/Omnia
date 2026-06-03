import { createRoute } from "@hono/zod-openapi";
import {
  createConnectionBodySchema,
  createConnectionResponseSchema
} from "../../types/connections/create.schema.js";
import { listConnectionsResponseSchema } from "../../types/connections/list.schema.js";
import {
  removeConnectionParamsSchema,
  removeConnectionResponseSchema
} from "../../types/connections/remove.schema.js";

export const createConnectionRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Connections"],
  request: {
    body: {
      content: {
        "application/json": { schema: createConnectionBodySchema }
      }
    }
  },
  responses: {
    201: {
      description: "Bot validated, stored, and webhook registered",
      content: {
        "application/json": { schema: createConnectionResponseSchema }
      }
    }
  }
});

export const listConnectionsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Connections"],
  responses: {
    200: {
      description: "Connected bots for the organization",
      content: {
        "application/json": { schema: listConnectionsResponseSchema }
      }
    }
  }
});

export const removeConnectionRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Connections"],
  request: {
    params: removeConnectionParamsSchema
  },
  responses: {
    200: {
      description: "Connection removed (webhook detached, row deleted)",
      content: {
        "application/json": { schema: removeConnectionResponseSchema }
      }
    }
  }
});
