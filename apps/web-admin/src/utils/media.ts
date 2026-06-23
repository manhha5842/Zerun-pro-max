const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export type MediaLike = {
  type?: string | null;
  mimeType?: string | null;
  sourceUrl?: string | null;
  localPath?: string | null;
  cloudinaryUrl?: string | null;
};

const DIRECT_URL_PATTERN = /^(https?:|data:|blob:)/i;

export function mediaPathOf(media: MediaLike) {
  return media.cloudinaryUrl ?? media.localPath ?? media.sourceUrl ?? "";
}

export function mediaUrlOf(media: MediaLike) {
  return resolveMediaUrl(mediaPathOf(media));
}

export function resolveMediaUrl(value: string) {
  if (!value) return "";
  if (DIRECT_URL_PATTERN.test(value)) return value;
  return `${API_BASE}/media/local?path=${encodeURIComponent(value)}`;
}

export function isVideoMedia(media: MediaLike | string) {
  const value = typeof media === "string" ? media : `${media.mimeType ?? ""} ${media.type ?? ""} ${mediaPathOf(media)}`;
  return /video|\.mp4$|\.mov$|\.avi$|\.webm$|\.mkv$/i.test(value);
}

export function isImageMedia(media: MediaLike | string) {
  if (isVideoMedia(media)) return false;
  const value = typeof media === "string" ? media : `${media.mimeType ?? ""} ${media.type ?? ""} ${mediaPathOf(media)}`;
  return /image|\.png$|\.jpe?g$|\.gif$|\.webp$|\.avif$/i.test(value);
}
