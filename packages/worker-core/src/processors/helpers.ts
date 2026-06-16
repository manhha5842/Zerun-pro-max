import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AdapterAccount, RawMedia } from "@zerun/adapters";
import type { Platform } from "@zerun/shared";

export function toAdapterAccount(account: {
  id: string;
  platform: string;
  name: string;
  handle: string | null;
  credentials: unknown;
  config: unknown;
}): AdapterAccount {
  return {
    id: account.id,
    platform: account.platform as Platform,
    name: account.name,
    handle: account.handle,
    credentials: asRecord(account.credentials),
    config: asRecord(account.config)
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function makeContentCode(): string {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `JOB-${stamp}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function mapMediaAssets(media: Array<{ type: string; mimeType: string | null; sourceUrl: string | null; localPath: string | null; metadata: unknown }>): RawMedia[] {
  return media.map((asset) => ({
    type: asset.type as RawMedia["type"],
    mimeType: asset.mimeType ?? undefined,
    url: asset.sourceUrl ?? undefined,
    localPath: asset.localPath ?? undefined,
    metadata: asRecord(asset.metadata)
  }));
}

export function normalizeCommentMedia(value: unknown): RawMedia[] {
  return normalizeMediaInput(value);
}

export function normalizeMediaPaths(value: unknown): RawMedia[] {
  return normalizeMediaInput(value);
}

function normalizeMediaInput(value: unknown): RawMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RawMedia[] => {
    if (typeof item === "string") {
      return [{
        type: inferMediaType(item),
        mimeType: inferMimeType(item),
        localPath: /^https?:\/\//i.test(item) ? undefined : item,
        url: /^https?:\/\//i.test(item) ? item : undefined
      }];
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const localPath = typeof record.localPath === "string" ? record.localPath : typeof record.path === "string" ? record.path : undefined;
      const url = typeof record.url === "string" ? record.url : typeof record.sourceUrl === "string" ? record.sourceUrl : undefined;
      const type = typeof record.type === "string" ? record.type : inferMediaType(localPath ?? url ?? "");
      return [{
        type: type as RawMedia["type"],
        mimeType: typeof record.mimeType === "string" ? record.mimeType : inferMimeType(localPath ?? url ?? ""),
        localPath,
        url,
        metadata: asRecord(record.metadata)
      }];
    }
    return [];
  });
}

export function applyConvertedLinks(text: string, links: Array<{ originalUrl: string; convertedUrl: string | null }>): string {
  return links.reduce((current, link) => (link.convertedUrl ? current.split(link.originalUrl).join(link.convertedUrl) : current), text);
}

export async function ensureLocalMediaAssets(media: RawMedia[], options: { contentId?: string } = {}): Promise<RawMedia[]> {
  if (media.length === 0) return media;

  const root = process.env.MEDIA_UPLOAD_ROOT ?? process.env.MEDIA_STORAGE_DIR ?? path.resolve("storage/uploads");
  const dir = path.join(root, "remote-media", new Date().toISOString().slice(0, 10));

  return Promise.all(media.map(async (asset, index) => {
    if (asset.localPath || !asset.url || !/^https?:\/\//i.test(asset.url)) return asset;

    try {
      const response = await fetch(asset.url);
      if (!response.ok) return asset;

      const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || asset.mimeType;
      const type = normalizeMediaType(asset.type, mimeType, asset.url);
      const extension = inferExtension(asset.url, mimeType, type);
      await mkdir(dir, { recursive: true });

      const contentPart = safeFileSegment(options.contentId ?? "media");
      const filePath = path.join(dir, `${contentPart}-${index}-${Date.now()}-${randomBytes(3).toString("hex")}${extension}`);
      await writeFile(filePath, Buffer.from(await response.arrayBuffer()));

      return {
        ...asset,
        type,
        mimeType,
        localPath: filePath,
        metadata: {
          ...(asset.metadata ?? {}),
          downloadedFrom: asset.url
        }
      };
    } catch {
      return asset;
    }
  }));
}

/** Xóa các link rác (group, tutorial, cashback...) khỏi text. */
export function stripDropLinks(text: string, dropUrls: string[]): string {
  if (dropUrls.length === 0) return text;
  let result = text;
  for (const url of dropUrls) {
    // Xóa URL và khoảng trắng thừa xung quanh
    result = result.split(url).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }
  return result.trim();
}

function inferMediaType(mediaPath: string): RawMedia["type"] {
  const normalized = mediaPath.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|avi|webm|mkv)$/.test(normalized)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp|avif)$/.test(normalized)) return "image";
  return "document";
}

function inferMimeType(mediaPath: string): string | undefined {
  const normalized = mediaPath.split("?")[0].toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".webm")) return "video/webm";
  return undefined;
}

function normalizeMediaType(type: RawMedia["type"], mimeType: string | undefined, mediaPath: string): RawMedia["type"] {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (type === "image" || type === "video") return type;
  return inferMediaType(mediaPath);
}

function inferExtension(mediaPath: string, mimeType: string | undefined, type: RawMedia["type"]) {
  const fromPath = mediaPathExtension(mediaPath);
  if (fromPath) return fromPath;
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/avif") return ".avif";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "video/webm") return ".webm";
  return type === "image" ? ".jpg" : type === "video" ? ".mp4" : ".bin";
}

function mediaPathExtension(mediaPath: string) {
  try {
    const parsed = new URL(mediaPath);
    const ext = path.extname(parsed.pathname).toLowerCase();
    return /^[a-z0-9.]{2,8}$/i.test(ext) ? ext : "";
  } catch {
    const ext = path.extname(mediaPath.split("?")[0]).toLowerCase();
    return /^[a-z0-9.]{2,8}$/i.test(ext) ? ext : "";
  }
}

function safeFileSegment(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "media";
}
