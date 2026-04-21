import type { DetectedLink, LinkNetwork } from "@zerun/shared";

const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;

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
