import type { DetectedLink, LinkNetwork } from "@zerun/shared";

const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;

/** Vai trò của link, để rule engine quyết định giữ/convert/bỏ. */
export type LinkRole =
  | "product_link"
  | "campaign_link"
  | "review_link"
  | "tutorial_link"
  | "group_link"
  | "cashback_link"
  | "form_link"
  | "unknown";

/**
 * Đoán vai trò link bằng rule chắc chắn (không cần AI).
 * Các domain dưới đây không nên convert affiliate và thường cần xử lý riêng.
 */
export function detectLinkRole(url: string): LinkRole {
  const host = safeHost(url);
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "tutorial_link";
  if (host.includes("forms.gle") || host.includes("docs.google.com")) return "form_link";
  if (host === "t.me" || host.includes("telegram.me")) return "group_link";
  if (host.includes("muahanghoantien.com")) return "cashback_link";
  if (detectNetwork(url) !== "unknown") return "product_link";
  return "unknown";
}

export function detectNetwork(url: string): LinkNetwork {
  const host = safeHost(url);
  if (host.endsWith("shopee.vn") || host.includes("shopee.")) return "shopee";
  if (host.endsWith("lazada.vn") || host.includes("lazada.")) return "lazada";
  if (host.endsWith("tiki.vn")) return "tiki";
  if (host.endsWith("sendo.vn")) return "sendo";
  if (host.includes("tiktok.com") || host.includes("shop.tiktok.com")) return "tiktok_shop";
  return "unknown";
}

export function detectLinks(text: string): DetectedLink[] {
  const matches = text.matchAll(urlPattern);
  return Array.from(matches, (match) => {
    const raw = match[0] ?? "";
    const url = raw.replace(/[,.!?;:]+$/g, "");
    const start = match.index ?? 0;
    const end = start + url.length;
    const network = detectNetwork(url);

    return {
      url,
      network,
      supported: network !== "unknown",
      position: { start, end }
    };
  });
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const SHORTENERS = ["s.shopee.vn", "s.lazada.vn", "bit.ly", "shp.ee", "t.co", "tinyurl.com"];

/** Có phải short link cần expand trước khi detect network không. */
export function isShortLink(url: string): boolean {
  const host = safeHost(url);
  return SHORTENERS.some((s) => host === s || host.endsWith("." + s));
}

/**
 * Expand short link bằng HTTP redirect-follow. Placeholder: cần inject fetcher
 * thật ở worker (giữ core không phụ thuộc network). Trả về url gốc nếu không expand được.
 */
export async function expandUrl(
  url: string,
  follow?: (u: string) => Promise<string>
): Promise<string> {
  if (!follow || !isShortLink(url)) return url;
  try {
    return (await follow(url)) || url;
  } catch {
    return url;
  }
}
