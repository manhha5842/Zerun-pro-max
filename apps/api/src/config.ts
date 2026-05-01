import { z } from "zod";
import { ensureDesktopRuntime, resolveRuntimePath } from "@zerun/shared";

const runtime = ensureDesktopRuntime();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(runtime.config.server.port),
  API_HOST: z.string().default(runtime.config.server.host),
  API_ORIGIN: z.string().default("http://localhost:5173"),
  WEB_ADMIN_DIST: z.string().default("apps/web-admin/dist"),
  JWT_SECRET: z.string().default(runtime.config.security.jwtSecret),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(30),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ZERUN_QUEUE_MODE: z.enum(["local", "redis"]).default("local"),
  FACEBOOK_SESSION_ROOT: z.string().default(resolveRuntimePath(runtime.config.storage.facebookSessionDir, runtime.appDataDir)),
  INSTAGRAM_SESSION_ROOT: z.string().default(resolveRuntimePath(runtime.config.storage.instagramSessionDir, runtime.appDataDir)),
  THREADS_SESSION_ROOT: z.string().default(resolveRuntimePath(runtime.config.storage.threadsSessionDir, runtime.appDataDir)),
  X_SESSION_ROOT: z.string().default(resolveRuntimePath(runtime.config.storage.xSessionDir, runtime.appDataDir)),
  MEDIA_UPLOAD_ROOT: z.string().default(resolveRuntimePath(runtime.config.storage.uploadDir, runtime.appDataDir))
});

export const config = {
  ...envSchema.parse(process.env),
  RUNTIME: runtime
};
