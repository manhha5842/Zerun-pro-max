import { randomBytes } from "node:crypto";
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
