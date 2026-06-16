/**
 * Caption template theo từng nền tảng (M3-A4).
 * Cùng 1 deal → caption phù hợp độ dài/format mỗi nơi (X ngắn, FB/Telegram dài).
 * Giữ link affiliate (URL) khi phải cắt ngắn — link là phần quan trọng nhất.
 */

export type CaptionPlatform =
  | "telegram"
  | "x"
  | "facebook"
  | "instagram"
  | "threads"
  | "zalo-personal"
  | string;

/** Giới hạn ký tự thực tế mỗi nền tảng (để lề an toàn). */
const PLATFORM_LIMITS: Record<string, number> = {
  x: 280,
  threads: 500,
  instagram: 2200,
  facebook: 63206,
  telegram: 4096,
  "zalo-personal": 4000
};

export interface CaptionOptions {
  /** Override giới hạn ký tự. */
  maxLength?: number;
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

/** Chuẩn hoá khoảng trắng: bỏ space cuối dòng, gộp ≥3 dòng trống về 2. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Định dạng caption cho 1 nền tảng. Nếu vượt giới hạn → cắt ở ranh giới từ, thêm
 * "…", và cố gắng giữ lại URL đầu tiên ở cuối (link affiliate không bị mất).
 */
export function formatCaptionForPlatform(text: string, platform: CaptionPlatform, options: CaptionOptions = {}): string {
  const tidied = tidy(text ?? "");
  const limit = options.maxLength ?? PLATFORM_LIMITS[platform] ?? Number.POSITIVE_INFINITY;
  if (tidied.length <= limit) return tidied;

  const firstUrl = tidied.match(URL_PATTERN)?.[0];
  const ellipsis = "…";

  // Dành chỗ cho URL + xuống dòng nếu URL nằm ngoài phần bị cắt.
  if (firstUrl && firstUrl.length + ellipsis.length + 1 < limit) {
    const reserve = firstUrl.length + 2; // "\n" + url
    const bodyLimit = limit - reserve - ellipsis.length;
    const head = truncateAtWord(tidied.replace(firstUrl, "").trim(), bodyLimit);
    return `${head}${ellipsis}\n${firstUrl}`;
  }

  return `${truncateAtWord(tidied, limit - ellipsis.length)}${ellipsis}`;
}

/** Cắt chuỗi ≤ max ký tự ở ranh giới từ gần nhất (không cắt giữa từ nếu được). */
function truncateAtWord(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text.trim();
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const lastNewline = slice.lastIndexOf("\n");
  const cut = Math.max(lastSpace, lastNewline);
  return (cut > max * 0.5 ? slice.slice(0, cut) : slice).trim();
}

/** Giới hạn ký tự của 1 nền tảng (cho UI hiển thị / kiểm tra). */
export function platformCaptionLimit(platform: CaptionPlatform): number {
  return PLATFORM_LIMITS[platform] ?? Number.POSITIVE_INFINITY;
}
