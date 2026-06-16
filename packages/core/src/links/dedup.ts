import { createHash } from "node:crypto";

const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "fbclid", "gclid", "affiliate_id", "sub_id", "click_id"
];

const PRODUCT_DOMAINS = ["shopee.vn", "lazada.vn", "tiki.vn", "sendo.vn", "tiktok.com", "shp.ee"];

function stripTrackingAndQuery(url: string): string {
  try {
    const u = new URL(url);
    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param);
    }
    const host = u.hostname.toLowerCase();
    // Shopee và Lazada: giữ host+path, bỏ toàn bộ query (link sản phẩm không cần query)
    if (host.includes("shopee") || host.includes("lazada")) {
      return `${host}${u.pathname}`;
    }
    return `${host}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function isProductLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PRODUCT_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ContentHashes = {
  /** Hash chỉ từ link sản phẩm (ưu tiên dùng để dedup chéo nguồn). */
  linkHash: string;
  /** Hash từ text đã chuẩn hoá kết hợp link (fallback). */
  textHash: string;
};

/**
 * Tính hai hash để dedup chéo nguồn:
 * - linkHash: hash chỉ từ link sản phẩm (sau khi strip tracking + sort)
 * - textHash: hash từ text chuẩn hoá + link (dùng khi không có link)
 *
 * Tin được coi là trùng nếu linkHash trùng (và cả hai có link sản phẩm).
 */
export function computeContentHashes(text: string, links: string[]): ContentHashes {
  const productLinks = links.filter(isProductLink);
  const normalizedLinks = productLinks.map(stripTrackingAndQuery).sort();

  const linkHash = createHash("sha1")
    .update(normalizedLinks.join("|") || "__no_product_links__")
    .digest("hex");

  const textHash = createHash("sha1")
    .update(`${normalizeText(text)}::${normalizedLinks.join("|")}`)
    .digest("hex");

  return { linkHash, textHash };
}

/**
 * Kiểm tra xem hai bộ hash có được coi là trùng không.
 * Ưu tiên linkHash — nếu cả hai đều có link sản phẩm thật và linkHash trùng → trùng.
 */
export function isContentDuplicate(a: ContentHashes, b: ContentHashes): boolean {
  const noLink = "__no_product_links__";
  const aLinkHash = createHash("sha1").update(noLink).digest("hex");
  if (a.linkHash === aLinkHash || b.linkHash === aLinkHash) {
    // Một trong hai không có link sản phẩm → dùng textHash
    return a.textHash === b.textHash;
  }
  return a.linkHash === b.linkHash;
}
