import type { AiProvider } from "@zerun/core";
import { logger } from "@zerun/shared";
import type { PrismaClient } from "@zerun/db";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

type AiConfigRow = {
  id: string;
  provider: string;
  name: string;
  config: unknown;
};

/**
 * Tạo AiProvider từ config row (DB hoặc env).
 * apiKey có thể dạng "env:VAR_NAME" để đọc từ env.
 */
export function buildAiProvider(row: AiConfigRow): AiProvider {
  const cfg = asRecord(row.config);
  const baseUrl = resolve(cfg.baseUrl) ?? process.env.NINEROUTER_URL ?? process.env.AI_BASE_URL;
  const apiKey = resolve(cfg.apiKey) ?? process.env.NINEROUTER_KEY ?? process.env.AI_API_KEY;
  const model = resolve(cfg.model) ?? process.env.AI_MODEL ?? "auto";

  if (!baseUrl) throw new Error(`AiConfig(${row.name}): thiếu baseUrl (config.baseUrl hoặc NINEROUTER_URL)`);
  if (!apiKey) throw new Error(`AiConfig(${row.name}): thiếu apiKey (config.apiKey hoặc NINEROUTER_KEY)`);

  return new OpenAICompatibleProvider({ baseUrl, apiKey, model });
}

/** Module-level cache để tránh query DB mỗi tin nhắn. TTL 60 giây. */
let _cached: AiProvider | null | undefined = undefined;
let _cachedAt = 0;
const CACHE_TTL = 60_000;

export async function loadAiProvider(prisma: PrismaClient): Promise<AiProvider | null> {
  if (_cached !== undefined && Date.now() - _cachedAt < CACHE_TTL) {
    return _cached;
  }
  const row = await prisma.aiConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!row) {
    _cached = tryBuildFromEnv();
    if (!_cached) logger.warn("Không tìm thấy AiConfig active — AI tắt");
  } else {
    try {
      _cached = buildAiProvider(row);
    } catch (error) {
      logger.error("Lỗi khởi tạo AiProvider từ DB", { error: (error as Error).message });
      _cached = null;
    }
  }
  _cachedAt = Date.now();
  return _cached;
}

/** Invalidate cache khi user cập nhật config (gọi từ API route). */
export function invalidateAiProviderCache() {
  _cached = undefined;
  _cachedAt = 0;
}

function tryBuildFromEnv(): AiProvider | null {
  const baseUrl = process.env.NINEROUTER_URL ?? process.env.AI_BASE_URL;
  const apiKey = process.env.NINEROUTER_KEY ?? process.env.AI_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const model = process.env.AI_MODEL ?? "auto";
  return new OpenAICompatibleProvider({ baseUrl, apiKey, model });
}

function resolve(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (value.startsWith("env:")) return process.env[value.slice(4)];
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
