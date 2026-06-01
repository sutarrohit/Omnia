import { createRouter } from "../../lib/create-app.js";

import * as handlers from "./demo.handler.js";
import * as routes from "./demo.route.js";

const demoRoutes = createRouter()
  .openapi(routes.createDemo, handlers.createDemoHandler)
  .openapi(routes.getDemos, handlers.getDemosHandler)
  .openapi(routes.getDemoById, handlers.getDemoByIdHandler)
  .openapi(routes.updateDemo, handlers.updateDemoHandler)
  .openapi(routes.deleteDemo, handlers.deleteDemoHandler);

export default demoRoutes;
