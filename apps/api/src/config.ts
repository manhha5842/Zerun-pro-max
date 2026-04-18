import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  API_ORIGIN: z.string().default("http://localhost:5173"),
  WEB_ADMIN_DIST: z.string().default("apps/web-admin/dist"),
  JWT_SECRET: z.string().default("change-this-secret-before-production"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(30),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  FACEBOOK_SESSION_ROOT: z.string().default("storage/sessions/facebook")
});

export const config = envSchema.parse(process.env);
