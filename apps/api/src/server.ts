import { buildApp } from "./app.js";
import { config } from "./config.js";
import { startConfiguredTunnel } from "./tunnel.js";
import { logger } from "@zerun/shared";

const app = await buildApp();
let tunnel: ReturnType<typeof startConfiguredTunnel>;

const close = async () => {
  tunnel?.stop();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: config.PORT, host: config.API_HOST });
tunnel = startConfiguredTunnel(config.RUNTIME);
logger.info("Zerun API đang chạy", {
  port: config.PORT,
  host: config.API_HOST,
  appDataDir: config.RUNTIME.appDataDir,
  dbPath: config.RUNTIME.dbPath
});
