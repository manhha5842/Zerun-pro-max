import { ConfigurationError } from "@zerun/shared";

export function readString(source: Record<string, unknown>, key: string, fallback?: string): string {
  const value = source[key] ?? fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConfigurationError(`Thiếu cấu hình "${key}"`);
  }
  return value.trim();
}

export function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function readNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ConfigurationError(`Thiếu hoặc sai định dạng cấu hình "${key}"`);
  }
  return parsed;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
