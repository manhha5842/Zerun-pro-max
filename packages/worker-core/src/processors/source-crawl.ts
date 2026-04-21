import { classifyError, logger, realtimeBus } from "@zerun/shared";
import { sourceCrawlJobSchema, type SourceCrawlJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { makeContentCode, toAdapterAccount } from "./helpers.js";

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
    const result = await adapter.crawl({
      account: toAdapterAccount(source),
      limit: Number((source.config as Record<string, unknown>)?.limit ?? 20),
      since: job.crawlWindow?.from ? new Date(job.crawlWindow.from) : undefined
    });

    let createdCount = 0;
    for (const item of result.items) {
      const existing = await context.prisma.content.findUnique({
        where: {
          platform_sourceId_externalId: {
            platform: item.platform,
            sourceId: source.id,
            externalId: item.externalId
          }
        }
      });

      const content = existing
        ? await context.prisma.content.update({
            where: { id: existing.id },
            data: {
              originalText: item.text,
              sourceUrl: item.originalUrl,
              author: item.author,
              postedAt: item.postedAt,
              metadata: (item.metadata ?? {}) as any
            }
          })
        : await context.prisma.content.create({
            data: {
              code: makeContentCode(),
              platform: item.platform,
              sourceId: source.id,
              externalId: item.externalId,
              sourceUrl: item.originalUrl,
              author: item.author,
              originalText: item.text,
              status: "discovered",
              postedAt: item.postedAt,
              metadata: (item.metadata ?? {}) as any,
              media: {
                create: item.media.map((media) => ({
                  type: media.type,
                  mimeType: media.mimeType,
                  sourceUrl: media.url,
                  localPath: media.localPath,
                  metadata: (media.metadata ?? {}) as any
                }))
              }
            }
          });

      if (!existing) {
        createdCount += 1;
        realtimeBus.emitEvent({
          type: "content:new",
          contentId: content.id,
          code: content.code,
          platform: item.platform,
          createdAt: new Date().toISOString()
        });
      }

      await context.enqueueContentProcess({ version: 1, contentId: content.id });
    }

    await context.prisma.sourceAccount.update({
      where: { id: source.id },
      data: { lastCrawledAt: new Date(), health: "healthy" }
    });

    await context.prisma.activityLog.create({
      data: {
        type: "crawl:complete",
        platform: source.platform,
        sourceId: source.id,
        message: `Đã crawl ${result.items.length} nội dung từ ${source.name}, mới ${createdCount} nội dung.`
      }
    });

    realtimeBus.emitEvent({
      type: "crawl:complete",
      sourceId: source.id,
      platform: source.platform as never,
      itemCount: result.items.length,
      createdAt: new Date().toISOString()
    });

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
