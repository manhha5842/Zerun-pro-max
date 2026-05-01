import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const DESKTOP_APP_ID = "com.zerun.app";

export type DesktopRuntimeConfig = {
  server: {
    port: number;
    host: string;
    exposeLan: boolean;
  };
  database: {
    path: string;
  };
  tunnel: {
    enabled: boolean;
    provider: string;
    token: string;
    publicUrl: string;
  };
  storage: {
    mediaDir: string;
    uploadDir: string;
    facebookSessionDir: string;
    instagramSessionDir: string;
    threadsSessionDir: string;
    xSessionDir: string;
    logsDir: string;
  };
  security: {
    jwtSecret: string;
  };
};

export type DesktopRuntime = {
  appId: string;
  appDataDir: string;
  configPath: string;
  dbPath: string;
  databaseUrl: string;
  config: DesktopRuntimeConfig;
};

let cachedRuntime: DesktopRuntime | undefined;

export function ensureDesktopRuntime(): DesktopRuntime {
  if (cachedRuntime) return cachedRuntime;

  const appDataDir = resolveAppDataDir();
  mkdirSync(appDataDir, { recursive: true });

  const configPath = path.join(appDataDir, "config.toml");
  const loaded = existsSync(configPath) ? parseRuntimeToml(readFileSync(configPath, "utf8")) : {};
  const config = normalizeRuntimeConfig(loaded, appDataDir);
  writeFileSync(configPath, formatRuntimeToml(config), "utf8");

  const dbPath = resolveRuntimePath(config.database.path, appDataDir);
  const databaseUrl = toPrismaSqliteUrl(dbPath);

  [
    path.dirname(dbPath),
    resolveRuntimePath(config.storage.mediaDir, appDataDir),
    resolveRuntimePath(config.storage.uploadDir, appDataDir),
    resolveRuntimePath(config.storage.facebookSessionDir, appDataDir),
    resolveRuntimePath(config.storage.instagramSessionDir, appDataDir),
    resolveRuntimePath(config.storage.threadsSessionDir, appDataDir),
    resolveRuntimePath(config.storage.xSessionDir, appDataDir),
    resolveRuntimePath(config.storage.logsDir, appDataDir)
  ].forEach((dir) => mkdirSync(dir, { recursive: true }));

  cachedRuntime = {
    appId: DESKTOP_APP_ID,
    appDataDir,
    configPath,
    dbPath,
    databaseUrl,
    config
  };

  applyRuntimeEnv(cachedRuntime);
  return cachedRuntime;
}

export function readDesktopRuntime(): DesktopRuntime {
  return ensureDesktopRuntime();
}

export function updateDesktopRuntimeConfig(patch: Partial<DesktopRuntimeConfig>): DesktopRuntime {
  const current = ensureDesktopRuntime();
  const next = normalizeRuntimeConfig(deepMerge(current.config, patch), current.appDataDir);
  cachedRuntime = undefined;
  writeFileSync(current.configPath, formatRuntimeToml(next), "utf8");
  return ensureDesktopRuntime();
}

export function resolveRuntimePath(value: string, appDataDir = resolveAppDataDir()) {
  return path.isAbsolute(value) ? value : path.join(appDataDir, value);
}

function resolveAppDataDir() {
  if (process.env.ZERUN_APP_DATA_DIR) return path.resolve(process.env.ZERUN_APP_DATA_DIR);

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"), DESKTOP_APP_ID);
  }

  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", DESKTOP_APP_ID);
  }

  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), DESKTOP_APP_ID);
}

function normalizeRuntimeConfig(input: Record<string, any>, appDataDir: string): DesktopRuntimeConfig {
  const server = input.server ?? {};
  const database = input.database ?? {};
  const tunnel = input.tunnel ?? {};
  const storage = input.storage ?? {};
  const security = input.security ?? {};
  const exposeLan = Boolean(server.expose_lan ?? server.exposeLan ?? false);

  return {
    server: {
      port: toPort(server.port, 3000),
      exposeLan,
      host: String(server.host ?? (exposeLan ? "0.0.0.0" : "127.0.0.1"))
    },
    database: {
      path: String(database.path ?? "post_logs.sqlite")
    },
    tunnel: {
      enabled: Boolean(tunnel.enabled ?? false),
      provider: String(tunnel.provider ?? "cloudflare"),
      token: String(tunnel.token ?? ""),
      publicUrl: String(tunnel.public_url ?? tunnel.publicUrl ?? "")
    },
    storage: {
      mediaDir: String(storage.media_dir ?? storage.mediaDir ?? "storage/media"),
      uploadDir: String(storage.upload_dir ?? storage.uploadDir ?? "storage/uploads/manual"),
      facebookSessionDir: String(storage.facebook_session_dir ?? storage.facebookSessionDir ?? "storage/sessions/facebook"),
      instagramSessionDir: String(storage.instagram_session_dir ?? storage.instagramSessionDir ?? "storage/sessions/instagram"),
      threadsSessionDir: String(storage.threads_session_dir ?? storage.threadsSessionDir ?? "storage/sessions/threads"),
      xSessionDir: String(storage.x_session_dir ?? storage.xSessionDir ?? "storage/sessions/x"),
      logsDir: String(storage.logs_dir ?? storage.logsDir ?? "logs")
    },
    security: {
      jwtSecret: String(security.jwt_secret ?? security.jwtSecret ?? randomSecret())
    }
  };
}

function applyRuntimeEnv(runtime: DesktopRuntime) {
  process.env.DATABASE_URL = runtime.databaseUrl;
  process.env.PORT ??= String(runtime.config.server.port);
  process.env.API_HOST ??= runtime.config.server.host;
  process.env.JWT_SECRET ??= runtime.config.security.jwtSecret;
  process.env.ZERUN_QUEUE_MODE ??= "local";
  process.env.ENABLE_WORKERS ??= "true";
  process.env.MEDIA_STORAGE_DIR ??= resolveRuntimePath(runtime.config.storage.mediaDir, runtime.appDataDir);
  process.env.MEDIA_UPLOAD_ROOT ??= resolveRuntimePath(runtime.config.storage.uploadDir, runtime.appDataDir);
  process.env.FACEBOOK_SESSION_ROOT ??= resolveRuntimePath(runtime.config.storage.facebookSessionDir, runtime.appDataDir);
  process.env.INSTAGRAM_SESSION_ROOT ??= resolveRuntimePath(runtime.config.storage.instagramSessionDir, runtime.appDataDir);
  process.env.THREADS_SESSION_ROOT ??= resolveRuntimePath(runtime.config.storage.threadsSessionDir, runtime.appDataDir);
  process.env.X_SESSION_ROOT ??= resolveRuntimePath(runtime.config.storage.xSessionDir, runtime.appDataDir);
  process.env.PUBLIC_BASE_URL ??= `http://localhost:${runtime.config.server.port}`;
  process.env.API_ORIGIN ??= [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    `http://localhost:${runtime.config.server.port}`,
    `http://127.0.0.1:${runtime.config.server.port}`
  ].join(",");
}

function parseRuntimeToml(content: string): Record<string, any> {
  const root: Record<string, any> = {};
  let section: Record<string, any> = root;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = ensureSection(root, sectionMatch[1].trim());
      continue;
    }

    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    section[key] = parseTomlValue(value);
  }

  return root;
}

function ensureSection(root: Record<string, any>, name: string) {
  return name.split(".").reduce((target, part) => {
    target[part] ??= {};
    return target[part];
  }, root);
}

function parseTomlValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

function formatRuntimeToml(config: DesktopRuntimeConfig) {
  return [
    "[server]",
    `port = ${config.server.port}`,
    `host = ${quoteToml(config.server.host)}`,
    `expose_lan = ${config.server.exposeLan}`,
    "",
    "[database]",
    `path = ${quoteToml(config.database.path)}`,
    "",
    "[tunnel]",
    `enabled = ${config.tunnel.enabled}`,
    `provider = ${quoteToml(config.tunnel.provider)}`,
    `token = ${quoteToml(config.tunnel.token)}`,
    `public_url = ${quoteToml(config.tunnel.publicUrl)}`,
    "",
    "[storage]",
    `media_dir = ${quoteToml(config.storage.mediaDir)}`,
    `upload_dir = ${quoteToml(config.storage.uploadDir)}`,
    `facebook_session_dir = ${quoteToml(config.storage.facebookSessionDir)}`,
    `instagram_session_dir = ${quoteToml(config.storage.instagramSessionDir)}`,
    `threads_session_dir = ${quoteToml(config.storage.threadsSessionDir)}`,
    `x_session_dir = ${quoteToml(config.storage.xSessionDir)}`,
    `logs_dir = ${quoteToml(config.storage.logsDir)}`,
    "",
    "[security]",
    `jwt_secret = ${quoteToml(config.security.jwtSecret)}`,
    ""
  ].join("\n");
}

function quoteToml(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toPrismaSqliteUrl(dbPath: string) {
  return `file:${path.resolve(dbPath).replace(/\\/g, "/")}`;
}

function toPort(value: unknown, fallback: number) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

function deepMerge<T extends Record<string, any>>(target: T, patch: Partial<T>): T {
  const next: Record<string, any> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = deepMerge(next[key] ?? {}, value as Record<string, any>);
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next as T;
}
