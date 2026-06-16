import { AdapterAuthError, ConfigurationError, type Platform } from "@zerun/shared";
import { Zalo, ThreadType, type API, type Credentials } from "zca-js";
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
      const item = this.toRawItem(account, message);
      if (!item) return;
      void onItem(item).catch(() => undefined);
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

    // zca-js chỉ nhận attachment là file cục bộ (string path). Bỏ qua media chỉ có URL.
    const attachments = input.media
      .map((m) => m.localPath)
      .filter((path): path is string => typeof path === "string" && path.trim().length > 0);

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
      const api = await new Zalo().login(credentials);
      this.apiCache.set(account.id, api);
      return api;
    } catch (error) {
      throw new AdapterAuthError(`Đăng nhập Zalo thất bại: ${(error as Error).message}`);
    }
  }

  private toRawItem(account: AdapterAccount, message: { threadId: string; data: Record<string, unknown> }): RawSourceItem | null {
    const data = message.data;
    const content = data.content;
    const text = typeof content === "string" ? content : "";
    const media = extractZaloMedia(data);
    const msgId = typeof data.msgId === "string" ? data.msgId : undefined;
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
      metadata: { threadId: message.threadId }
    };
  }
}

export type ZaloGroupOption = {
  id: string;
  name: string;
  memberCount: number;
};

export async function listZaloGroups(account: AdapterAccount): Promise<ZaloGroupOption[]> {
  const api = await new Zalo().login(readCredentials(account));
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

function collectMediaUrls(value: unknown, urls: Map<string, RawMedia["type"]>, depth: number, key = ""): void {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
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
  if (/^(thumb|thumbnail|photo|image|img|video|media|href|url|src)$/i.test(key) && /\/(photo|image|img|video|media|attach|file)\b/i.test(url)) return true;
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
