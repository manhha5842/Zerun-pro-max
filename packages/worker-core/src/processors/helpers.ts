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

export function applyConvertedLinks(text: string, links: Array<{ originalUrl: string; convertedUrl: string | null }>): string {
  return links.reduce((current, link) => (link.convertedUrl ? current.split(link.originalUrl).join(link.convertedUrl) : current), text);
}
