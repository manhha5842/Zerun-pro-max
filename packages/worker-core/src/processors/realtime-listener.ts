import type { ListenerHandle, RawSourceItem } from "@zerun/adapters";
import type { AdapterRegistry } from "@zerun/adapters";
import type { PrismaClient } from "@zerun/db";
import { computeContentHashes } from "@zerun/core";
import { classifyError, logger, realtimeBus } from "@zerun/shared";
import type { ContentProcessJob } from "../types.js";
import { makeContentCode, toAdapterAccount } from "./helpers.js";

type EnqueueFn = (job: ContentProcessJob) => Promise<unknown>;
type DesiredAccount = { id: string; platform: string; name: string; handle: string | null; credentials: unknown; config: unknown };

const DEDUP_WINDOW_HOURS = 48;
/** Chu kỳ supervisor: khôi phục listener nên-chạy mà đang chết. */
const SUPERVISE_INTERVAL_MS = 60_000;
/** Backoff reconnect: tránh login dồn dập khi credentials hỏng. */
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 5 * 60_000;

/**
 * Quản lý vòng đời realtime listener cho các platform push-based (zca-js, ...).
 * Gọi `start()` khi worker boot, `stop()` khi shutdown.
 * Tự reconnect (re-login từ credentials đã lưu) khi listener rớt — qua onClose
 * và một supervisor định kỳ làm lưới an toàn.
 */
export class RealtimeListenerManager {
  private readonly handles = new Map<string, ListenerHandle>();
  /** Account "nên chạy" (từ start) để supervisor biết cần khôi phục. */
  private readonly desired = new Map<string, DesiredAccount>();
  private readonly reconnectFails = new Map<string, number>();
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private superviseTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly registry: AdapterRegistry,
    private readonly prisma: PrismaClient,
    private readonly enqueueContentProcess: EnqueueFn
  ) {}

  async start() {
    const platforms = this.registry.listRealtimePlatforms();
    if (platforms.length === 0) return;
    this.stopped = false;

    const accounts = await this.prisma.sourceAccount.findMany({
      where: {
        platform: { in: platforms as string[] },
        isActive: true,
        health: { not: "paused" }
      }
    });

    logger.info(`Khởi động realtime listener cho ${accounts.length} tài khoản`);
    for (const account of accounts) this.desired.set(account.id, account);

    await Promise.allSettled(accounts.map((account) => this.startAccount(account)));

    if (!this.superviseTimer) {
      this.superviseTimer = setInterval(() => void this.supervise(), SUPERVISE_INTERVAL_MS);
      this.superviseTimer.unref?.();
    }
  }

  async stop() {
    this.stopped = true;
    if (this.superviseTimer) {
      clearInterval(this.superviseTimer);
      this.superviseTimer = null;
    }
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
    this.desired.clear();
    this.reconnectFails.clear();

    const handles = [...this.handles.entries()];
    this.handles.clear();
    await Promise.allSettled(
      handles.map(async ([accountId, handle]) => {
        try {
          await handle.stop();
          logger.info(`Đã dừng realtime listener: ${accountId}`);
        } catch (error) {
          logger.warn(`Lỗi dừng listener ${accountId}`, { error: (error as Error).message });
        }
      })
    );
  }

  /** Supervisor: khôi phục listener nên-chạy mà hiện không còn handle. */
  private async supervise() {
    if (this.stopped) return;
    for (const [accountId, account] of this.desired) {
      if (!this.handles.has(accountId) && !this.reconnectTimers.has(accountId)) {
        logger.warn(`Supervisor phát hiện listener chết, khôi phục: ${account.name}`);
        await this.startAccount(account);
      }
    }
  }

  /** Lên lịch reconnect với backoff khi listener rớt. */
  private scheduleReconnect(account: DesiredAccount) {
    if (this.stopped || !this.desired.has(account.id)) return;
    if (this.reconnectTimers.has(account.id)) return;
    const fails = this.reconnectFails.get(account.id) ?? 0;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** fails);
    logger.warn(`Lên lịch reconnect listener ${account.name} sau ${delay}ms`, { fails });
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(account.id);
      void this.startAccount(account);
    }, delay);
    timer.unref?.();
    this.reconnectTimers.set(account.id, timer);
  }

  private async startAccount(account: DesiredAccount) {
    if (this.stopped) return;
    const existing = this.handles.get(account.id);
    if (existing) return;

    try {
      const adapter = this.registry.getRealtime(account.platform as never);
      const adapterAccount = toAdapterAccount(await this.withRealtimeConfig(account));

      const handle = await adapter.startListener(adapterAccount, async (item) => {
        await this.onItem(account.id, item);
      });

      this.handles.set(account.id, handle);
      this.reconnectFails.delete(account.id);
      // Rớt kết nối → gỡ handle + lên lịch reconnect (re-login từ credentials đã lưu).
      handle.onClose?.(() => {
        if (this.handles.get(account.id) === handle) this.handles.delete(account.id);
        this.scheduleReconnect(account);
      });
      logger.info(`Realtime listener đã bắt đầu: ${account.name} (${account.platform})`);
    } catch (error) {
      const classified = classifyError(error);
      this.reconnectFails.set(account.id, (this.reconnectFails.get(account.id) ?? 0) + 1);
      logger.error(`Không thể khởi động realtime listener: ${account.name}`, {
        accountId: account.id,
        error: classified.message
      });
      this.scheduleReconnect(account);
    }
  }

  private async withRealtimeConfig(account: DesiredAccount): Promise<DesiredAccount> {
    if (account.platform !== "telegram") return account;
    const channels = await this.prisma.platformChannel.findMany({
      where: { accountKind: "source", accountId: account.id, isSource: true, isActive: true },
      select: { externalId: true }
    });
    const config = account.config && typeof account.config === "object" && !Array.isArray(account.config)
      ? { ...(account.config as Record<string, unknown>) }
      : {};
    const credentials = account.credentials && typeof account.credentials === "object" && !Array.isArray(account.credentials)
      ? account.credentials as Record<string, unknown>
      : {};
    const credentialSource = typeof credentials.source === "string" && credentials.source.trim() ? credentials.source.trim() : null;
    const listenSources = channels.map((channel) => channel.externalId).filter(Boolean);
    if (listenSources.length === 0 && credentialSource) listenSources.push(credentialSource);
    return {
      ...account,
      config: {
        ...config,
        listenSources
      }
    };
  }

  private async onItem(sourceId: string, item: RawSourceItem) {
    try {
      const sourceChannels = await this.prisma.platformChannel.findMany({
        where: { accountKind: "source", accountId: sourceId, isSource: true, isActive: true }
      });
      const itemThreadId = readMetadataString(item.metadata, "threadId");
      const sourceChannel = sourceChannels.find((channel) => channel.externalId === itemThreadId) ?? null;
      if (sourceChannels.length > 0 && !sourceChannel) return;
      const externalId = sourceChannel ? `${sourceChannel.id}:${item.externalId}` : item.externalId;
      const existing = await this.prisma.content.findUnique({
        where: {
          platform_sourceId_externalId: {
            platform: item.platform,
            sourceId,
            externalId
          }
        },
        select: { id: true }
      });

      if (existing) return; // đã có (cùng nguồn), bỏ qua

      // Dedup chéo nguồn qua contentHash (giống source-crawl.ts)
      const links = item.text.match(/https?:\/\/\S+/g) ?? [];
      const hashes = computeContentHashes(item.text, links);
      const dedupWindowStart = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

      const duplicate = await (this.prisma as any).content.findFirst({
        where: {
          contentHash: hashes.linkHash,
          createdAt: { gte: dedupWindowStart },
          status: { notIn: ["duplicate", "skipped", "rejected"] }
        },
        select: { id: true }
      });

      if (duplicate) {
        const dupContent = await this.prisma.content.create({
          data: {
            code: makeContentCode(),
            platform: item.platform,
            sourceId,
            sourceChannelId: sourceChannel?.id,
            externalId,
            sourceUrl: item.originalUrl,
            author: item.author,
            originalText: item.text,
            status: "duplicate" as never,
            postedAt: item.postedAt,
            contentHash: hashes.linkHash,
            duplicateOfId: duplicate.id,
            metadata: { ...(item.metadata ?? {}), sourceChannelId: sourceChannel?.id ?? null, sourceChannelName: sourceChannel?.name ?? null } as never
          } as never
        });
        logger.debug(`Realtime: tin trùng ${dupContent.code} của ${duplicate.id}`);
        return;
      }

      const content = await this.prisma.content.create({
        data: {
          code: makeContentCode(),
          platform: item.platform,
          sourceId,
          sourceChannelId: sourceChannel?.id,
          externalId,
          sourceUrl: item.originalUrl,
          author: item.author,
          originalText: item.text,
          status: "discovered",
          postedAt: item.postedAt,
          contentHash: hashes.linkHash,
          metadata: { ...(item.metadata ?? {}), sourceChannelId: sourceChannel?.id ?? null, sourceChannelName: sourceChannel?.name ?? null } as never,
          media: {
            create: item.media.map((m) => ({
              type: m.type,
              mimeType: m.mimeType,
              sourceUrl: m.url,
              localPath: m.localPath,
              metadata: (m.metadata ?? {}) as never
            }))
          }
        } as never
      });

      realtimeBus.emitEvent({
        type: "content:new",
        contentId: content.id,
        code: content.code,
        platform: item.platform,
        createdAt: new Date().toISOString()
      });

      await this.enqueueContentProcess({ version: 1, contentId: content.id });

      logger.debug(`Realtime: tin mới từ ${item.platform}`, {
        contentId: content.id,
        externalId
      });
    } catch (error) {
      const classified = classifyError(error);
      logger.error("Lỗi xử lý realtime item", {
        sourceId,
        externalId: item.externalId,
        error: classified.message
      });
    }
  }
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
