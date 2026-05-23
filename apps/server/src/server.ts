import { buildApp, initializeApp } from "./app.js";
import { config } from "./config/config.js";

const { app, context } = await buildApp();

process.on("unhandledRejection", (error) => {
  app.log.error({ error }, "Unhandled async task rejected");
});

try {
  await initializeApp(context);
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
