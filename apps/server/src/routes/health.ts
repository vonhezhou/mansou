import type { FastifyInstance } from "fastify";
import { config } from "../config/config.js";
import { getNoProxyRules, getProxyUrl } from "../utils/fetch.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => healthPayload());
  app.get("/api/v1/health", async () => healthPayload());
}

function healthPayload() {
  return {
    ok: true,
    name: "venera_web",
    dataDir: config.dataDir,
    proxy: getProxyUrl(),
    noProxy: getNoProxyRules(),
  };
}
