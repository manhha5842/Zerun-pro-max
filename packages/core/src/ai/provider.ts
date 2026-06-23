import { dealAnalysisSchema, type DealAnalysis } from "./schemas.js";
import type { AiContext } from "./context-builder.js";

/** Tham số gọi AI provider. Static prompt giữ cố định để provider cache tốt. */
export type AiClassifyInput = {
  context: AiContext;
  /** Prompt tĩnh (rules + schema + few-shot). Giống nhau giữa các call. */
  systemPrompt: string;
};

export type AiUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AiClassifyResult = {
  analysis: DealAnalysis;
  raw: string;
  usage?: AiUsage;
};

/**
 * Interface chung cho mọi AI provider (OpenAI / DeepSeek / MiniMax / Anthropic / local).
 * Implementation cụ thể đặt ở worker hoặc adapters, nhận key từ Settings AI toàn hệ thống.
 */
export interface AiProvider {
  readonly name: string;
  /** Trả JSON string thô (chưa validate). Worker sẽ parse + validate + retry. */
  complete(input: AiClassifyInput): Promise<{ text: string; usage?: AiUsage }>;
}

export class InvalidAiJsonError extends Error {
  constructor(
    message: string,
    readonly raw: string
  ) {
    super(message);
    this.name = "InvalidAiJsonError";
  }
}

/**
 * Parse + validate output của provider thành DealAnalysis.
 * Tách JSON khỏi text (phòng khi model bọc trong ```json), rồi Zod parse.
 */
export function parseDealAnalysis(raw: string): DealAnalysis {
  const json = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new InvalidAiJsonError(`AI trả JSON không parse được: ${(error as Error).message}`, raw);
  }
  const result = dealAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidAiJsonError(`AI JSON sai schema: ${result.error.message}`, raw);
  }
  return result.data;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

/**
 * Helper chạy provider + validate + retry khi JSON invalid.
 * Worker gọi cái này; không tự gọi network từ core.
 */
export async function classifyWithRetry(
  provider: AiProvider,
  input: AiClassifyInput,
  maxRetries = 2
): Promise<AiClassifyResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { text, usage } = await provider.complete(input);
    try {
      return { analysis: parseDealAnalysis(text), raw: text, usage };
    } catch (error) {
      lastError = error;
      if (!(error instanceof InvalidAiJsonError)) throw error;
    }
  }
  throw lastError;
}
