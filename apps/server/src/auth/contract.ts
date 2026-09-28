import type { FastifyInstance } from "fastify";
import { openApiDocument } from "@venera/contracts";

// Consume the generated YAML schemas for runtime request validation and response serialization.
// Only auth routes are migrated here; business routes keep their existing validation.
export function registerAuthContract(app: FastifyInstance) {
  const schemas = Object.fromEntries(
    Object.entries(openApiDocument.components.schemas).filter(([name]) =>
      [
        "AuthSession",
        "LoginRequest",
        "ChangePasswordRequest",
        "ApiToken",
        "CreateApiTokenRequest",
        "CreateApiTokenResult",
        "Ok",
      ].includes(name),
    ),
  );
  const rewriteRefs = (schema: unknown) =>
    JSON.parse(
      JSON.stringify(schema).replaceAll("#/components/schemas/", "venera-auth#/definitions/"),
    );
  app.addSchema({ $id: "venera-auth", definitions: rewriteRefs(schemas) });
  const paths = Object.fromEntries(
    Object.entries(openApiDocument.paths).filter(([path]) => path.startsWith("/api/v1/auth/")),
  ) as unknown as Record<
    string,
    Record<
      string,
      {
        requestBody?: { content: { "application/json": { schema: unknown } } };
        responses: { "200": { content: { "application/json": { schema: unknown } } } };
      }
    >
  >;
  app.addHook("onRoute", (route) => {
    const path = route.url.replace(/:([^/]+)/g, "{$1}");
    if (!path.startsWith("/api/v1/auth/")) return;
    const method = Array.isArray(route.method) ? route.method[0] : route.method;
    const operation = paths[path]?.[method.toLowerCase()];
    if (!operation) return;
    route.schema = {
      ...route.schema,
      ...(operation.requestBody
        ? { body: rewriteRefs(operation.requestBody.content["application/json"].schema) }
        : {}),
      response: { 200: rewriteRefs(operation.responses["200"].content["application/json"].schema) },
    };
  });
}
