import type { PrismaClient } from "@zerun/db";

/**
 * Cảnh báo lỗi qua Telegram — port `_send_error_alert` từ reference bot.
 * Tập trung 1 chỗ, có throttle để không spam (cùng 1 loại lỗi/account chỉ gửi
 * lại sau `throttleMs`). Đọc cấu hình từ SystemSetting `telegram_notify`.
 */

export type AlertCategory =
  | "login_required"
  | "captcha"
  | "publish_fail"
  | "convert_fail"
  | "session_health";

export interface AlertInput {
  category: AlertCategory;
  platform?: string;
  account?: string;
  network?: string;
  detail?: string;
  /** Khoá dedup; mặc định `category:platform:account`. */
  throttleKey?: string;
  /** Khoảng cách tối thiểu giữa 2 alert cùng khoá (ms). Mặc định 5 phút. */
  throttleMs?: number;
}

export interface AlertResult {
  sent: boolean;
  reason?: "throttled" | "disabled" | "send_failed";
}

const DEFAULT_THROTTLE_MS = 5 * 60 * 1000;
const lastSent = new Map<string, number>();

/** Cho test/reset throttle. */
export function resetAlertThrottle(): void {
  lastSent.clear();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatAlert(input: AlertInput): string {
  const lines: string[] = [];
  const detail = input.detail ? escapeHtml(input.detail) : "";
  const platform = input.platform ? escapeHtml(input.platform) : "";
  const account = input.account ? escapeHtml(input.account) : "";
  const network = input.network ? escapeHtml(input.network) : "";

  switch (input.category) {
    case "login_required":
      lines.push("🔐 <b>Cần đăng nhập lại</b>");
      if (platform) lines.push(`· Nền tảng: ${platform}`);
      if (account) lines.push(`· Tài khoản: ${account}`);
      if (detail) lines.push(`· Lỗi: ${detail}`);
      lines.push("👉 Vào trang Phiên đăng nhập để login lại tài khoản này.");
      break;
    case "captcha":
      lines.push("🧩 <b>Nghi dính CAPTCHA</b>");
      if (network) lines.push(`· Mạng: ${network}`);
      if (detail) lines.push(`· Chi tiết: ${detail}`);
      lines.push("👉 Mở trình duyệt phiên affiliate và giải CAPTCHA thủ công.");
      break;
    case "publish_fail":
      lines.push("❌ <b>Đăng bài thất bại</b>");
      if (platform) lines.push(`· Nền tảng: ${platform}`);
      if (account) lines.push(`· Tài khoản: ${account}`);
      if (detail) lines.push(`· Lỗi: ${detail}`);
      break;
    case "convert_fail":
      lines.push("🔗 <b>Convert affiliate thất bại</b>");
      if (network) lines.push(`· Mạng: ${network}`);
      if (detail) lines.push(`· Lỗi: ${detail}`);
      lines.push("👉 Kiểm tra ở hàng đợi convert thủ công.");
      break;
    case "session_health":
      lines.push("⚠️ <b>Session không khoẻ</b>");
      if (platform) lines.push(`· Nền tảng: ${platform}`);
      if (account) lines.push(`· Tài khoản: ${account}`);
      if (detail) lines.push(`· Chi tiết: ${detail}`);
      lines.push("👉 Tài khoản đã tạm dừng nhận job tới khi khôi phục.");
      break;
    default:
      break;
  }
  return lines.join("\n");
}

/** Gửi alert (có throttle). Trả về `sent=false` nếu bị throttle / chưa bật / lỗi gửi. */
export async function sendAlert(prisma: PrismaClient, input: AlertInput): Promise<AlertResult> {
  const key = input.throttleKey ?? `${input.category}:${input.platform ?? ""}:${input.account ?? ""}`;
  const throttleMs = input.throttleMs ?? DEFAULT_THROTTLE_MS;
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev !== undefined && now - prev < throttleMs) {
    return { sent: false, reason: "throttled" };
  }

  let tg: Record<string, unknown> = {};
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "telegram_notify" } });
    tg = (setting?.value ?? {}) as Record<string, unknown>;
  } catch {
    return { sent: false, reason: "disabled" };
  }
  if (!tg.enabled || !tg.botToken || !tg.chatId) {
    return { sent: false, reason: "disabled" };
  }

  const ok = await fetch(`https://api.telegram.org/bot${String(tg.botToken)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(tg.chatId),
      text: formatAlert(input),
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  })
    .then((r) => r.ok)
    .catch(() => false);

  if (ok) lastSent.set(key, now);
  return { sent: ok, reason: ok ? undefined : "send_failed" };
}

/** Suy ra category từ message lỗi convert (login / captcha / generic). */
export function classifyConvertError(message: string): AlertCategory {
  const m = message.toLowerCase();
  if (/login|unauthor|401|token|đăng nhập/.test(m)) return "login_required";
  if (/captcha|no_data|no data|empty|rỗng|trống/.test(m)) return "captcha";
  return "convert_fail";
}
