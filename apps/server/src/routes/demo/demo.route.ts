import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { CreateDemoSchema, DemoFiltersSchema, DemoSchema, UpdateDemoSchema } from "../../types/types.js";

const PaginatedDemoSchema = z.object({
  data: z.array(DemoSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number()
  })
});

export const createDemo = createRoute({
  tags: ["Demo"],
  method: "post",
  path: "/demo",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateDemoSchema
        }
      }
    }
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(DemoSchema, "Demo created")
  }
});

export const getDemoById = createRoute({
  tags: ["Demo"],
  method: "get",
  path: "/demo/{id}",
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(DemoSchema, "Get demo by id"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(DemoSchema.nullable(), "Not found")
  }
});

export const getDemos = createRoute({
  tags: ["Demo"],
  method: "get",
  path: "/demo",
  request: {
    query: DemoFiltersSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(PaginatedDemoSchema, "Get demos")
  }
});

export const updateDemo = createRoute({
  tags: ["Demo"],
  method: "patch",
  path: "/demo/{id}",
  request: {
    params: z.object({
      id: z.string()
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateDemoSchema
        }
      }
    }
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(DemoSchema, "Demo updated"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(DemoSchema.nullable(), "Not found")
  }
});

export const deleteDemo = createRoute({
  tags: ["Demo"],
  method: "delete",
  path: "/demo/{id}",
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Demo deleted"
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(DemoSchema.nullable(), "Not found")
  }
});

export type createDemo = typeof createDemo;
export type getDemoById = typeof getDemoById;
export type getDemos = typeof getDemos;
export type updateDemo = typeof updateDemo;
export type deleteDemo = typeof deleteDemo;
