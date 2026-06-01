import { AppOpenAPI } from "./types.js";
import { swaggerUI } from "@hono/swagger-ui";
import packageJSON from "../../package.json" with { type: "json" };

export function configureOpenAPI(app: AppOpenAPI) {
  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      version: packageJSON.version,
      title: "Employee Management"
    }
  });

  app.get(
    "/swagger",
    swaggerUI({
      url: "/doc"
    })
  );
}
