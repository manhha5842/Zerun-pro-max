import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AdapterAuthError, ConfigurationError, type Platform } from "@zerun/shared";
import { ThreadType, type API, type Credentials } from "zca-js";
import type {
  AdapterAccount,
  AdapterHealth,
  ListenerHandle,
  PublishAdapter,
  PublishInput,
  PublishResult,
  RawMedia,
  RawSourceItem,
  RealtimeSourceAdapter
} from "../contracts.js";
import { createZaloClient } from "../session/zalo-client.js";
import { readString } from "../utils/credentials.js";

/**
 * Zalo cá nhân qua zca-js (unofficial — CHỈ dùng acc phụ).
 * Nguồn: realtime listener (RealtimeSourceAdapter). Đích: sendMessage (PublishAdapter).
 * API đã verify với zca-js v2.1.2 — xem docs/tutorials/zalo-zca-js.md.
 */
export class ZaloPersonalAdapter implements RealtimeSourceAdapter, PublishAdapter {
  readonly platform: Platform = "zalo-personal";

  /** Cache API theo accountId để tái dùng session (tránh login lặp). */
  private readonly apiCache = new Map<string, API>();

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    try {
      const api = await this.getApi(account);
      const info = await api.fetchAccountInfo();
      return info
        ? { status: "healthy", message: "Zalo session hợp lệ" }
        : { status: "failed", message: "Không lấy được thông tin tài khoản Zalo" };
    } catch (error) {
      this.apiCache.delete(account.id);
      return { status: "failed", message: `Zalo session lỗi: ${(error as Error).message}` };
    }
  }

  async startListener(
    account: AdapterAccount,
    onItem: (item: RawSourceItem) => Promise<void>
  ): Promise<ListenerHandle> {
    const api = await this.getApi(account);

    api.listener.on("message", (message) => {
      if (message.isSelf) return;
      if (message.type !== ThreadType.Group) return;
      if (!matchesConfiguredThread(account, message.threadId)) return;
      void this.toRawItem(account, message)
        .then((item) => {
          if (!item) return;
          return onItem(item);
        })
        .catch(() => undefined);
    });

    // Tín hiệu rớt kết nối để manager reconnect. zca-js retryOnClose lo blip mạng;
    // onClose chỉ bắn khi đóng hẳn (session hết hạn → cần re-login).
    const closeHandlers: Array<() => void> = [];
    const fireClose = () => {
      this.apiCache.delete(account.id);
      for (const handler of closeHandlers.splice(0)) handler();
    };
    try {
      const listener = api.listener as unknown as { on?: (event: string, cb: () => void) => void };
      listener.on?.("closed", fireClose);
      listener.on?.("error", fireClose);
    } catch {
      // zca-js phiên bản không hỗ trợ event này → dựa vào supervisor định kỳ của manager.
    }

    api.listener.start({ retryOnClose: true });

    return {
      stop: async () => {
        api.listener.stop();
        this.apiCache.delete(account.id);
      },
      onClose: (handler) => closeHandlers.push(handler)
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const threadId = readString(input.account.config, "threadId", input.account.handle ?? undefined);
    const api = await this.getApi(input.account);

    const attachments = await resolveZaloAttachments(input.account, input.media);
    if (input.media.length > 0 && attachments.length === 0) {
      throw new Error("Không tải được ảnh/video Zalo để gửi kèm.");
    }

    const message: { msg: string; attachments?: string[] } = { msg: input.text };
    if (attachments.length > 0) message.attachments = attachments;

    const response = await api.sendMessage(message, threadId, ThreadType.Group);
    const externalId = extractMsgId(response);
    return { externalId, metadata: { threadId, attachmentCount: attachments.length } };
  }

  // ── nội bộ ─────────────────────────────────────────────────────────────

  private async getApi(account: AdapterAccount): Promise<API> {
    const cached = this.apiCache.get(account.id);
    if (cached) return cached;
    const credentials = readCredentials(account);
    try {
      const api = await createZaloClient().login(credentials);
      this.apiCache.set(account.id, api);
      return api;
    } catch (error) {
      throw new AdapterAuthError(`Đăng nhập Zalo thất bại: ${(error as Error).message}`);
    }
  }

  private async toRawItem(account: AdapterAccount, message: { threadId: string; data: Record<string, unknown> }): Promise<RawSourceItem | null> {
    const data = message.data;
    const text = extractZaloText(data);
    const media = await resolveIncomingZaloMedia(account, extractZaloMedia(data));
    const msgId = typeof data.msgId === "string" || typeof data.msgId === "number" ? String(data.msgId) : undefined;
    if (!msgId) return null;
    if (text.trim().length === 0 && media.length === 0) return null;

    const author = (typeof data.dName === "string" && data.dName) || (typeof data.uidFrom === "string" ? data.uidFrom : undefined);
    const tsRaw = data.ts;
    const ts = typeof tsRaw === "string" || typeof tsRaw === "number" ? Number(tsRaw) : NaN;

    return {
      platform: this.platform,
      sourceId: account.id,
      externalId: msgId,
      author,
      text,
      media,
      postedAt: Number.isFinite(ts) ? new Date(ts) : undefined,
      metadata: {
        threadId: message.threadId,
        senderId: typeof data.uidFrom === "string" ? data.uidFrom : undefined,
        senderName: typeof data.dName === "string" ? data.dName : undefined,
        msgType: typeof data.msgType === "string" ? data.msgType : undefined,
        mediaCount: media.length
      }
    };
  }
}

export type ZaloGroupOption = {
  id: string;
  name: string;
  memberCount: number;
};

export async function listZaloGroups(account: AdapterAccount): Promise<ZaloGroupOption[]> {
  const api = await createZaloClient().login(readCredentials(account));
  const response = await api.getAllGroups();
  const groupIds = Object.keys(response.gridVerMap);
  if (groupIds.length === 0) return [];

  const gridInfoMap: Record<string, Awaited<ReturnType<API["getGroupInfo"]>>["gridInfoMap"][string]> = {};
  for (let index = 0; index < groupIds.length; index += 50) {
    const info = await api.getGroupInfo(groupIds.slice(index, index + 50));
    Object.assign(gridInfoMap, info.gridInfoMap);
  }
  return groupIds
    .map((id) => {
      const group = gridInfoMap[id];
      return {
        id,
        name: group?.name?.trim() || `Nhóm ${id}`,
        memberCount: Number(group?.totalMember ?? group?.memberIds?.length ?? 0)
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "vi"));
}

function matchesConfiguredThread(account: AdapterAccount, incomingThreadId: string): boolean {
  const configured = new Set<string>();
  const single = account.config.threadId;
  if (typeof single === "string" && single.trim()) configured.add(single.trim());

  const multiple = account.config.threadIds;
  if (Array.isArray(multiple)) {
    for (const value of multiple) {
      if (typeof value === "string" && value.trim()) configured.add(value.trim());
    }
  }

  return configured.size === 0 || configured.has(incomingThreadId);
}

async function resolveZaloAttachments(account: AdapterAccount, media: RawMedia[]): Promise<string[]> {
  const attachments: string[] = [];
  for (const [index, item] of media.entries()) {
    const localPath = item.localPath?.trim();
    if (localPath) {
      attachments.push(localPath);
      continue;
    }

    const downloaded = await downloadZaloAttachment(account, item, index);
    if (downloaded) attachments.push(downloaded);
  }
  return attachments;
}

async function downloadZaloAttachment(account: AdapterAccount, media: RawMedia, index: number): Promise<string | null> {
  if (!media.url || !/^https?:\/\//i.test(media.url)) return null;

  try {
    const credentials = readCredentials(account);
    const response = await fetch(media.url, {
      headers: {
        "Cookie": cookieHeaderFromCredentials(credentials.cookie),
        "User-Agent": credentials.userAgent,
        "Referer": "https://chat.zalo.me/",
        "Accept": media.type === "video" ? "video/*,*/*" : "image/*,*/*"
      }
    });
    if (!response.ok) return null;

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || media.mimeType;
    const extension = inferExtension(media.url, mimeType, media.type);
    const root = process.env.MEDIA_UPLOAD_ROOT ?? process.env.MEDIA_STORAGE_DIR ?? path.resolve("storage/uploads");
    const dir = path.join(root, "zalo-attachments", new Date().toISOString().slice(0, 10));
    await mkdir(dir, { recursive: true });

    const filePath = path.join(dir, `${safeFileSegment(account.id)}-${index}-${Date.now()}-${randomBytes(3).toString("hex")}${extension}`);
    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    return filePath;
  } catch {
    return null;
  }
}

async function resolveIncomingZaloMedia(account: AdapterAccount, media: RawMedia[]): Promise<RawMedia[]> {
  const resolved: RawMedia[] = [];
  for (const [index, item] of media.entries()) {
    if (item.localPath) {
      resolved.push(item);
      continue;
    }
    const localPath = await downloadZaloAttachment(account, item, index);
    resolved.push(localPath ? { ...item, localPath } : item);
  }
  return resolved;
}

function cookieHeaderFromCredentials(cookie: Credentials["cookie"]): string {
  const cookies = Array.isArray(cookie) ? cookie : cookie.cookies;
  return cookies
    .map((item) => {
      const record = item as { name?: unknown; key?: unknown; value?: unknown };
      const name = typeof record.name === "string" ? record.name : typeof record.key === "string" ? record.key : "";
      const value = typeof record.value === "string" ? record.value : "";
      return name && value ? `${name}=${value}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

function readCredentials(account: AdapterAccount): Credentials {
  const source = account.credentials;
  const imei = source.imei;
  const userAgent = source.userAgent;
  const cookie = source.cookie;
  if (typeof imei !== "string" || imei.trim().length === 0) {
    throw new ConfigurationError("Thiếu credentials Zalo: imei (đăng nhập QR trước)");
  }
  if (typeof userAgent !== "string" || userAgent.trim().length === 0) {
    throw new ConfigurationError("Thiếu credentials Zalo: userAgent");
  }
  if (!cookie || typeof cookie !== "object") {
    throw new ConfigurationError("Thiếu credentials Zalo: cookie");
  }
  const language = typeof source.language === "string" ? source.language : undefined;
  return { imei, userAgent, cookie: cookie as Credentials["cookie"], language };
}

function extractMsgId(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const record = response as Record<string, unknown>;
  const message = record.message;
  if (message && typeof message === "object") {
    const msgId = (message as Record<string, unknown>).msgId;
    if (typeof msgId === "string") return msgId;
    if (typeof msgId === "number") return String(msgId);
  }
  return undefined;
}

function extractZaloMedia(data: Record<string, unknown>): RawMedia[] {
  const urls = new Map<string, RawMedia["type"]>();
  collectMediaUrls(data, urls, 0);
  return Array.from(urls.entries()).map(([url, type], index) => ({
    type,
    url,
    mimeType: inferMimeType(url, type),
    metadata: { source: "zalo-personal", sortOrder: index }
  }));
}

function extractZaloText(data: Record<string, unknown>): string {
  const fragments: string[] = [];
  const content = data.content;
  if (typeof content === "string") {
    pushTextFragment(fragments, content);
  } else {
    collectZaloTextFragments(content, fragments, 0);
  }
  for (const link of collectNonMediaLinks(data)) pushTextFragment(fragments, link);
  return uniqueFragments(fragments).join("\n").trim();
}

const TEXT_KEYS = new Set([
  "caption",
  "content",
  "desc",
  "description",
  "message",
  "msg",
  "text",
  "title"
]);

function collectZaloTextFragments(value: unknown, fragments: string[], depth: number, key = ""): void {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    const parsed = parseJsonLike(value);
    if (parsed !== value) {
      collectZaloTextFragments(parsed, fragments, depth + 1, key);
      return;
    }
    if (TEXT_KEYS.has(key.toLowerCase())) pushTextFragment(fragments, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectZaloTextFragments(item, fragments, depth + 1, key);
    return;
  }
  if (typeof value !== "object") return;

  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = childKey.toLowerCase();
    if (TEXT_KEYS.has(normalizedKey)) {
      if (typeof childValue === "string") pushTextFragment(fragments, childValue);
      else collectZaloTextFragments(childValue, fragments, depth + 1, childKey);
      continue;
    }
    if (normalizedKey === "params" || normalizedKey === "attach") {
      collectZaloTextFragments(parseJsonLike(childValue), fragments, depth + 1, childKey);
    }
  }
}

function collectNonMediaLinks(value: unknown): string[] {
  const urls = new Set<string>();
  collectUrls(value, urls, 0);
  return [...urls].filter((url) => !isMediaUrl(url, "") && /^(https?:\/\/)?(s\.)?(shopee|lazada|tiktok|tiki|sendo)\./i.test(url.replace(/^https?:\/\//i, "")));
}

function collectUrls(value: unknown, urls: Set<string>, depth: number): void {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    const parsed = parseJsonLike(value);
    if (parsed !== value) {
      collectUrls(parsed, urls, depth + 1);
      return;
    }
    for (const match of value.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
      const url = normalizeUrl(match.replace(/[),.;]+$/g, ""));
      if (url) urls.add(url);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, urls, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  for (const childValue of Object.values(value as Record<string, unknown>)) collectUrls(childValue, urls, depth + 1);
}

function parseJsonLike(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function pushTextFragment(fragments: string[], value: string): void {
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return;
  if (/^https?:\/\//i.test(text) && isMediaUrl(text, "")) return;
  fragments.push(text);
}

function uniqueFragments(fragments: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const fragment of fragments) {
    const normalized = fragment.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(fragment);
  }
  return result;
}

function collectMediaUrls(value: unknown, urls: Map<string, RawMedia["type"]>, depth: number, key = ""): void {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    const parsed = parseJsonLike(value);
    if (parsed !== value) {
      collectMediaUrls(parsed, urls, depth + 1, key);
      return;
    }
    const url = normalizeUrl(value);
    if (url && isMediaUrl(url, key)) {
      urls.set(url, inferZaloMediaType(url, key));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaUrls(item, urls, depth + 1, key);
    return;
  }
  if (typeof value !== "object") return;

  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (childKey === "content" && typeof childValue === "string") continue;
    collectMediaUrls(childValue, urls, depth + 1, childKey);
  }
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function isMediaUrl(url: string, key: string): boolean {
  const normalized = url.toLowerCase().split("?")[0];
  if (/\.(jpg|jpeg|png|gif|webp|avif|mp4|mov|webm|avi|mkv)$/.test(normalized)) return true;
  if (/^(hdurl|normalurl|rawurl|previewthumb|thumburl|thumb|thumbnail|photo|image|img|video|media|src)$/i.test(key)) return true;
  if (/^(href|url)$/i.test(key) && /\/(photo|image|img|video|media|attach|file|album|gif)\b/i.test(url)) return true;
  return false;
}

function inferZaloMediaType(url: string, key: string): RawMedia["type"] {
  const normalized = url.toLowerCase().split("?")[0];
  if (/\.(mp4|mov|webm|avi|mkv)$/.test(normalized) || /video/i.test(key)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp|avif)$/.test(normalized) || /(thumb|photo|image|img)/i.test(key)) return "image";
  return "document";
}

function inferMimeType(url: string, type: RawMedia["type"]): string | undefined {
  const normalized = url.toLowerCase().split("?")[0];
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".webm")) return "video/webm";
  return type === "image" ? "image/jpeg" : type === "video" ? "video/mp4" : undefined;
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
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "zalo";
}
