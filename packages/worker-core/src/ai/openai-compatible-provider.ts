import type { AiClassifyInput, AiProvider, AiUsage } from "@zerun/core";
import { logger } from "@zerun/shared";

export type OpenAICompatibleOptions = {
  baseUrl: string;
  apiKey: string;
  /** "auto" = lấy model đầu tiên từ /v1/models. */
  model?: string;
  userAgent?: string;
  timeoutMs?: number;
};

export class OpenAICompatibleProvider implements AiProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private model: string;
  private cachedModel: string | undefined;

  constructor(options: OpenAICompatibleOptions) {
    const normalized = options.baseUrl.replace(/\/+$/, "");
    this.name = `openai-compatible:${normalized}`;
    this.baseUrl = normalized;
    this.apiKey = options.apiKey;
    this.model = options.model ?? "auto";
    this.userAgent = options.userAgent ?? "Zerun-Worker/1.0 (zerun.app)";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async complete(input: AiClassifyInput): Promise<{ text: string; usage?: AiUsage }> {
    const model = await this.resolveModel();
    const body = {
      model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: buildUserMessage(input) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1024
    };

    const signal = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`AI HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const text = payload.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("AI trả về nội dung rỗng");

    return {
      text,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens
          }
        : undefined
    };
  }

  /** Kiểm tra kết nối — gọi /api/health (9router) hoặc /v1/models. */
  async testConnection(): Promise<{ ok: boolean; model: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        headers: { "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(10_000)
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        return { ok: false, model: this.model, latencyMs };
      }
      const model = await this.resolveModel();
      return { ok: true, model, latencyMs };
    } catch {
      return { ok: false, model: this.model, latencyMs: Date.now() - start };
    }
  }

  private async resolveModel(): Promise<string> {
    if (this.model !== "auto") return this.model;
    if (this.cachedModel) return this.cachedModel;
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000)
      });
      if (response.ok) {
        const payload = (await response.json()) as { data?: Array<{ id: string }> };
        const first = payload.data?.[0]?.id;
        if (first) {
          this.cachedModel = first;
          logger.info(`AI provider auto-model: ${first}`);
          return first;
        }
      }
    } catch (error) {
      logger.warn("Không lấy được auto-model, dùng fallback", { error: (error as Error).message });
    }
    this.cachedModel = "gpt-4o-mini";
    return this.cachedModel;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "User-Agent": this.userAgent
    };
  }
}

function buildUserMessage(input: AiClassifyInput): string {
  return JSON.stringify(input.context);
}
