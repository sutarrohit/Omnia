import { AppRouteHandler } from "../../lib/types.js";

import * as HttpStatusCodes from "stoker/http-status-codes";
import { createDemo, deleteDemo, getDemoById, getDemos, updateDemo } from "@/src/services/demoService.js";
import {
  createDemo as createDemoRoute,
  deleteDemo as deleteDemoRoute,
  getDemoById as getDemoByIdRoute,
  getDemos as getDemosRoute,
  updateDemo as updateDemoRoute
} from "./demo.route.js";

export const createDemoHandler: AppRouteHandler<createDemoRoute> = async (c) => {
  const data = c.req.valid("json");
  const demo = await createDemo(data);
  return c.json(demo, HttpStatusCodes.CREATED);
};

export const getDemoByIdHandler: AppRouteHandler<getDemoByIdRoute> = async (c) => {
  const { id } = c.req.valid("param");
  const demo = await getDemoById(id);
  return c.json(demo, HttpStatusCodes.OK);
};

export const getDemosHandler: AppRouteHandler<getDemosRoute> = async (c) => {
  const filters = c.req.valid("query");
  const demos = await getDemos(filters);
  return c.json(demos, HttpStatusCodes.OK);
};

export const updateDemoHandler: AppRouteHandler<updateDemoRoute> = async (c) => {
  const { id } = c.req.valid("param");
  const data = c.req.valid("json");
  const demo = await updateDemo(id, data);
  return c.json(demo, HttpStatusCodes.OK);
};

export const deleteDemoHandler: AppRouteHandler<deleteDemoRoute> = async (c) => {
  const { id } = c.req.valid("param");
  await deleteDemo(id);
  return c.body(null, HttpStatusCodes.NO_CONTENT);
};
