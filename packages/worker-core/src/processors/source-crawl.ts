import { computeContentHashes, groupRawMessagesIntoPackages, type ContentPackage, type RawMessageForGrouping } from "@zerun/core";
import type { RawMedia, RawSourceItem } from "@zerun/adapters";
import { classifyError, logger, realtimeBus } from "@zerun/shared";
import { sourceCrawlJobSchema, type SourceCrawlJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { asRecord, makeContentCode, toAdapterAccount } from "./helpers.js";

const DEDUP_WINDOW_HOURS = 48;

export async function processSourceCrawl(rawJob: unknown, context: ProcessorContext) {
  const job = sourceCrawlJobSchema.parse(rawJob) satisfies SourceCrawlJob;
  const startedAt = new Date();

  const log = await context.prisma.workerJobLog.create({
    data: {
      queueName: "source-crawl",
      jobName: "source.crawl",
      status: "running",
      payload: job,
      startedAt
    }
  });

  try {
    const source = await context.prisma.sourceAccount.findUniqueOrThrow({ where: { id: job.sourceId } });
    if (!source.isActive || source.health === "paused") {
      throw new Error("Source đang tắt hoặc bị pause");
    }

    const adapter = context.registry.getSource(source.platform as never);
    const sourceChannels = await context.prisma.platformChannel.findMany({
      where: { accountKind: "source", accountId: source.id, isSource: true, isActive: true }
    });
    const sourceConfig = asRecord(source.config);
    const telegramCursorByChannel = readNumberMap(sourceConfig.telegramCursorByChannel);
    const nextTelegramCursorByChannel = { ...telegramCursorByChannel };
    const channelInputs = sourceChannels.length > 0 ? sourceChannels : [null];
    const crawlResults = await Promise.all(channelInputs.map(async (channel) => {
      const cursorKey = getCursorKey(channel);
      const account = applyCrawlCursor(
        applySourceChannel(source, channel),
        source.platform,
        telegramCursorByChannel[cursorKey]
      );
      const result = await adapter.crawl({
        account: toAdapterAccount(account),
        limit: Number((source.config as Record<string, unknown>)?.limit ?? 20),
        since: job.crawlWindow?.from ? new Date(job.crawlWindow.from) : undefined
      });
      return result.items.map((item) => ({ item, channel }));
    }));
    const items = crawlResults.flat();

    const rawEntries = items.map((entry) => {
      const { item, channel } = entry;
      if (source.platform === "telegram") {
        updateTelegramCursor(nextTelegramCursorByChannel, getCursorKey(channel), item.externalId);
      }
      return { ...entry, rawMessage: toRawMessageForGrouping(item, source.id, channel) };
    });
    const rawEntryById = new Map(rawEntries.map((entry) => [entry.rawMessage.id, entry]));
    const contentPackages = groupRawMessagesIntoPackages(rawEntries.map((entry) => entry.rawMessage));

    let createdCount = 0;
    let existingCount = 0;
    for (const contentPackage of contentPackages) {
      const packageEntries = contentPackage.rawMessageIds
        .map((id) => rawEntryById.get(id))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      const firstEntry = packageEntries[0];
      if (!firstEntry) continue;
      const { channel } = firstEntry;
      const externalId = externalIdForPackage(contentPackage, channel);
      const existing = await context.prisma.content.findUnique({
        where: {
          platform_sourceId_externalId: {
            platform: contentPackage.platform,
            sourceId: source.id,
            externalId
          }
        }
      });

      if (existing) {
        existingCount += 1;
        await context.prisma.content.update({
          where: { id: existing.id },
          data: {
            originalText: contentPackage.groupedText,
            sourceUrl: contentPackage.links[0] ?? firstEntry.item.originalUrl,
            author: contentPackage.senderName,
            postedAt: firstEntry.item.postedAt,
            sourceChannelId: channel?.id,
            metadata: buildContentPackageMetadata(contentPackage, packageEntries, channel) as any
          }
        });
        if (existing.status === "discovered" || existing.status === "failed") {
          await context.enqueueContentProcess({ version: 1, contentId: existing.id });
        }
        continue;
      }

      // Tầng 2: dedup chéo nguồn qua contentHash
      const links = contentPackage.links;
      const hashes = computeContentHashes(contentPackage.groupedText, links);
      const dedupWindowStart = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

      const duplicate = await (context.prisma as any).content.findFirst({
        where: {
          contentHash: hashes.linkHash,
          createdAt: { gte: dedupWindowStart },
          status: { notIn: ["duplicate", "skipped", "rejected"] }
        },
        select: { id: true }
      });

      if (duplicate) {
        // Tin trùng — tạo bản ghi nhẹ với status=duplicate, không chạy AI/convert/publish
        const dupContent = await context.prisma.content.create({
          data: {
            code: makeContentCode(),
            platform: contentPackage.platform,
            sourceId: source.id,
            sourceChannelId: channel?.id,
            externalId,
            sourceUrl: contentPackage.links[0] ?? firstEntry.item.originalUrl,
            author: contentPackage.senderName,
            originalText: contentPackage.groupedText,
            status: "duplicate" as never,
            postedAt: firstEntry.item.postedAt,
            contentHash: hashes.linkHash,
            duplicateOfId: duplicate.id,
            metadata: buildContentPackageMetadata(contentPackage, packageEntries, channel) as any
          } as any
        });
        logger.debug(`Content ${dupContent.code} là bản trùng của ${duplicate.id}`);
        continue;
      }

      const content = await context.prisma.content.create({
        data: {
          code: makeContentCode(),
          platform: contentPackage.platform,
          sourceId: source.id,
          sourceChannelId: channel?.id,
          externalId,
          sourceUrl: contentPackage.links[0] ?? firstEntry.item.originalUrl,
          author: contentPackage.senderName,
          originalText: contentPackage.groupedText,
          status: "discovered",
          postedAt: firstEntry.item.postedAt,
          contentHash: hashes.linkHash,
          metadata: buildContentPackageMetadata(contentPackage, packageEntries, channel) as any,
          media: {
            create: contentPackage.media.map((media) => ({
              type: media.type,
              mimeType: media.mimeType,
              sourceUrl: media.url,
              localPath: media.localPath,
              metadata: (media.metadata ?? {}) as any
            }))
          }
        } as any
      });

      createdCount += 1;
      realtimeBus.emitEvent({
        type: "content:new",
        contentId: content.id,
        code: content.code,
        platform: contentPackage.platform as never,
        createdAt: new Date().toISOString()
      });

      await context.enqueueContentProcess({ version: 1, contentId: content.id });
    }

    const shouldPersistTelegramCursor =
      source.platform === "telegram" &&
      JSON.stringify(telegramCursorByChannel) !== JSON.stringify(nextTelegramCursorByChannel);
    await context.prisma.sourceAccount.update({
      where: { id: source.id },
      data: {
        lastCrawledAt: new Date(),
        health: "healthy",
        ...(shouldPersistTelegramCursor
          ? { config: { ...sourceConfig, telegramCursorByChannel: nextTelegramCursorByChannel } as any }
          : {})
      }
    });

    await context.prisma.activityLog.create({
      data: {
        type: "crawl:complete",
        platform: source.platform,
        sourceId: source.id,
        message: `Đã crawl ${items.length} nội dung từ ${source.name}, mới ${createdCount} nội dung.`
      }
    });

    realtimeBus.emitEvent({
      type: "crawl:complete",
      sourceId: source.id,
      platform: source.platform as never,
      itemCount: items.length,
      createdAt: new Date().toISOString()
    });
    logger.debug("Source crawl summary", { sourceId: source.id, itemCount: items.length, createdCount, existingCount });

    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "completed", completedAt: new Date() }
    });
  } catch (error) {
    const classified = classifyError(error);
    logger.error("Crawl job lỗi", { sourceId: job.sourceId, error: classified.message, kind: classified.kind });
    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "failed", error: classified.message, completedAt: new Date() }
    });
    throw classified;
  }
}

function readNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) result[key] = parsed;
  }
  return result;
}

type SourceChannelForPackage = { id: string; name: string; externalId: string } | null;
type PackageEntry = {
  item: RawSourceItem;
  channel: SourceChannelForPackage;
  rawMessage: RawMessageForGrouping;
};

function toRawMessageForGrouping(item: RawSourceItem, sourceId: string, channel: SourceChannelForPackage): RawMessageForGrouping {
  const senderId = readMetadataString(item.metadata, "senderId")
    ?? readMetadataString(item.metadata, "fromId")
    ?? item.author
    ?? "unknown";
  const senderName = readMetadataString(item.metadata, "senderName") ?? item.author ?? senderId;
  return {
    id: channel ? `${channel.id}:${item.externalId}` : item.externalId,
    platform: item.platform,
    sourceId,
    sourceChannelId: channel?.id ?? null,
    senderId,
    senderName,
    text: item.text,
    media: item.media as RawMedia[],
    links: extractLinks(item.text),
    replyToMessageId: readMetadataString(item.metadata, "replyToMessageId") ?? readMetadataString(item.metadata, "replyTo"),
    mediaGroupId: readMetadataString(item.metadata, "mediaGroupId") ?? readMetadataString(item.metadata, "media_group_id"),
    createdAt: item.postedAt ?? new Date(),
    originalUrl: item.originalUrl,
    metadata: item.metadata ?? {}
  };
}

function externalIdForPackage(contentPackage: ContentPackage, channel: SourceChannelForPackage) {
  if (contentPackage.rawMessageIds.length === 1) return contentPackage.rawMessageIds[0];
  const prefix = channel ? `${channel.id}:` : "";
  return `${prefix}pkg:${contentPackage.rawMessageIds.join("+")}`;
}

function buildContentPackageMetadata(contentPackage: ContentPackage, packageEntries: PackageEntry[], channel: SourceChannelForPackage) {
  const firstMetadata = packageEntries[0]?.item.metadata ?? {};
  return {
    ...firstMetadata,
    sourceChannelId: channel?.id ?? null,
    sourceChannelName: channel?.name ?? null,
    contentPackage: {
      rawMessageIds: contentPackage.rawMessageIds,
      status: contentPackage.status,
      confidence: contentPackage.confidence,
      productCount: contentPackage.productCount,
      groupingReason: contentPackage.groupingReason,
      linkCount: contentPackage.links.length,
      mediaCount: contentPackage.media.length,
      rawMessages: packageEntries.map(({ item, rawMessage }) => ({
        id: rawMessage.id,
        externalId: item.externalId,
        senderId: rawMessage.senderId,
        senderName: rawMessage.senderName,
        text: rawMessage.text,
        mediaCount: rawMessage.media.length,
        links: rawMessage.links ?? [],
        replyToMessageId: rawMessage.replyToMessageId ?? null,
        mediaGroupId: rawMessage.mediaGroupId ?? null,
        createdAt: rawMessage.createdAt.toISOString()
      }))
    }
  };
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function extractLinks(text: string) {
  return text.match(/https?:\/\/\S+/g) ?? [];
}

function getCursorKey(channel: { id: string } | null) {
  return channel?.id ?? "__default__";
}

function applyCrawlCursor(
  account: {
    id: string;
    platform: string;
    name: string;
    handle: string | null;
    credentials: unknown;
    config: unknown;
  },
  platform: string,
  cursor: number | undefined
) {
  if (platform !== "telegram" || !cursor) return account;
  return {
    ...account,
    config: {
      ...asRecord(account.config),
      telegramMinId: cursor
    }
  };
}

function updateTelegramCursor(cursorByChannel: Record<string, number>, cursorKey: string, externalId: string) {
  const messageId = Number(externalId);
  if (!Number.isFinite(messageId) || messageId <= 0) return;
  cursorByChannel[cursorKey] = Math.max(cursorByChannel[cursorKey] ?? 0, messageId);
}

function applySourceChannel(
  account: {
    id: string;
    platform: string;
    name: string;
    handle: string | null;
    credentials: unknown;
    config: unknown;
  },
  channel: { externalId: string } | null
) {
  if (!channel) return account;
  const credentials = account.credentials && typeof account.credentials === "object" && !Array.isArray(account.credentials)
    ? { ...(account.credentials as Record<string, unknown>) }
    : {};
  const config = account.config && typeof account.config === "object" && !Array.isArray(account.config)
    ? { ...(account.config as Record<string, unknown>) }
    : {};
  if (account.platform === "telegram") credentials.source = channel.externalId;
  if (account.platform === "zalo-personal") config.threadId = channel.externalId;
  return { ...account, credentials, config };
}
