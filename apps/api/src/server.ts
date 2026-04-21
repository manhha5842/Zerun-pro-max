import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "@zerun/shared";

const app = await buildApp();

const close = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: config.PORT, host: "0.0.0.0" });
logger.info("Zerun API đang chạy", { port: config.PORT });
