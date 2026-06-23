import type { AiProvider } from "@zerun/core";
import { logger } from "@zerun/shared";
import type { PrismaClient } from "@zerun/db";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

/** Module-level cache để tránh query DB mỗi tin nhắn. TTL 60 giây. */
let _cached: AiProvider | null | undefined = undefined;
let _cachedAt = 0;
const CACHE_TTL = 60_000;

export async function loadAiProvider(prisma: PrismaClient): Promise<AiProvider | null> {
  if (_cached !== undefined && Date.now() - _cachedAt < CACHE_TTL) {
    return _cached;
  }
  _cached = await tryBuildFromSettings(prisma) ?? tryBuildFromEnv();
  if (!_cached) logger.warn("Chưa cấu hình AI trong Settings — AI tắt");
  _cachedAt = _cached ? Date.now() : 0;
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

async function tryBuildFromSettings(prisma: PrismaClient): Promise<AiProvider | null> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "ai_settings" } }).catch(() => null);
  const cfg = asRecord(setting?.value);
  const baseUrl = resolve(cfg.baseUrl) ?? resolve(cfg.provider) ?? resolve(cfg.endpoint);
  const apiKey = resolve(cfg.apiKey);
  if (!baseUrl || !apiKey) return null;
  const model = resolve(cfg.model) ?? "auto";
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
