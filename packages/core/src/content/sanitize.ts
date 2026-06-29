export type DealTextSanitizerOptions = {
  dropUrls?: string[];
  linkRewriteMap?: Record<string, string>;
};

const SOURCE_PROMO_LINE_PATTERN =
  /(xem\s*h[ưuớo]?ng\s*d[aẫ]n|xem\s*hd|tool|t[ᴑo]+l|trick|clubmuare|muareclub|tagliveshopee|shopeeooo_bot)/i;

const SOURCE_DOMAIN_PATTERN = /(t\.me|telegram\.me|shopee\.ooo)/i;
const SEPARATOR_LINE_PATTERN = /^[\s.\-_=➖—–]{3,}$/;

export function sanitizeDealText(text: string, options: DealTextSanitizerOptions = {}): string {
  let result = rewriteMappedLinks(text, options.linkRewriteMap);

  for (const url of options.dropUrls ?? []) {
    result = result.split(url).join("");
  }

  result = result.replace(/\s*[\[(][^\]\)\n]*(?:xem\s*hd|xem\s*h[ưuớo]?ng\s*d[aẫ]n)[^\]\)\n]*(?:t\.me|telegram\.me)[^\]\)\n]*[\])]/gi, "");
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*\(\2\)/g, "$1: $2");

  const keptLines = result
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => shouldKeepLine(line));

  return keptLines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shouldKeepLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed === ".") return false;
  if (SEPARATOR_LINE_PATTERN.test(trimmed)) return false;
  if (SOURCE_DOMAIN_PATTERN.test(trimmed) && SOURCE_PROMO_LINE_PATTERN.test(trimmed)) return false;
  if (/^xem\s+thêm:?$/i.test(normalizeVietnamese(trimmed))) return false;
  return true;
}

function rewriteMappedLinks(text: string, linkRewriteMap: Record<string, string> | undefined) {
  if (!linkRewriteMap) return text;
  return Object.entries(linkRewriteMap).reduce((current, [from, to]) => {
    const source = from.trim();
    const target = to.trim();
    if (!source || !target) return current;
    return current.replace(new RegExp(escapeRegExp(source), "g"), target);
  }, text);
}

function normalizeVietnamese(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
