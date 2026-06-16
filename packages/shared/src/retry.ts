import { classifyError } from "./errors.js";
import { logger } from "./logger.js";

/**
 * Retry/backoff chuẩn cho crawl/convert/publish — gom 1 chỗ.
 * - Lỗi tạm thời (network/rate-limit/FLOOD_WAIT) → tự retry với exponential backoff.
 * - Lỗi vĩnh viễn (auth/checkpoint/validation/config) → dừng ngay + log rõ.
 * - Tôn trọng thời gian chờ do nền tảng yêu cầu (Telegram FLOOD_WAIT, Retry-After).
 */

export interface RetryOptions {
  /** Số lần thử lại (không tính lần đầu). Mặc định 3. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  /** Override quyết định lỗi nào đáng retry. */
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  label?: string;
  /** Inject sleep cho test. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Trích thời gian chờ (ms) mà nền tảng yêu cầu, nếu có:
 * - GramJS `FloodWaitError` có `.seconds`.
 * - Message dạng `FLOOD_WAIT_42` / `A wait of 42 seconds is required`.
 */
export function retryAfterMs(error: unknown): number | undefined {
  const e = error as { seconds?: unknown; message?: unknown } | null;
  if (e && typeof e.seconds === "number" && e.seconds > 0) return e.seconds * 1000;
  const message = error instanceof Error ? error.message : typeof e?.message === "string" ? e.message : String(error ?? "");
  const flood = /FLOOD_WAIT_(\d+)/i.exec(message);
  if (flood) return Number(flood[1]) * 1000;
  const wait = /wait of (\d+) seconds/i.exec(message);
  if (wait) return Number(wait[1]) * 1000;
  return undefined;
}

function defaultIsRetryable(error: unknown): boolean {
  if (retryAfterMs(error) !== undefined) return true;
  return classifyError(error).retryable;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    factor = 2,
    jitter = true,
    label = "withRetry"
  } = options;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (error) {
      attempt += 1;
      const classified = classifyError(error);
      if (attempt > retries || !isRetryable(error)) {
        logger.error(`${label}: dừng (lỗi vĩnh viễn hoặc hết lượt retry)`, {
          attempt,
          kind: classified.kind,
          message: classified.message
        });
        throw classified;
      }

      const suggested = retryAfterMs(error);
      let delayMs: number;
      if (suggested !== undefined) {
        delayMs = suggested + 1000; // buffer 1s sau khi nền tảng hết hạn chờ
      } else {
        const backoff = Math.min(maxDelayMs, baseDelayMs * factor ** (attempt - 1));
        delayMs = jitter ? Math.round(backoff * (0.5 + Math.random() * 0.5)) : backoff;
      }

      logger.warn(`${label}: lỗi tạm thời, thử lại lần ${attempt} sau ${delayMs}ms`, {
        kind: classified.kind,
        message: classified.message
      });
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
