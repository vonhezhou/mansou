import { buildApp, initializeApp } from "./app.js";

const { app, context } = await buildApp();
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.close();
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
process.on("unhandledRejection", (error) => {
  app.log.error({ error }, "Unhandled async task rejected");
});
try {
  await initializeApp(context);
  if (!shuttingDown) await app.listen({ port: context.config.port, host: context.config.host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await shutdown();
}
