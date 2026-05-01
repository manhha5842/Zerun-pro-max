import { createHash } from "node:crypto";
import { classifyError, logger, realtimeBus } from "@zerun/shared";
import type { AdapterAccount, CrawlResult, RawSourceItem } from "@zerun/adapters";
import { crawlJobRunSchema, type CrawlJobRunJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { asRecord, toAdapterAccount } from "./helpers.js";

type CrawlTargetAccount = {
  id: string;
  platform: string;
  name: string;
  handle: string | null;
  isActive: boolean;
  health: string;
  credentials: unknown;
  config: unknown;
};

export async function processCrawlJob(rawJob: unknown, context: ProcessorContext) {
  const job = crawlJobRunSchema.parse(rawJob) satisfies CrawlJobRunJob;
  const startedAt = new Date();
  const log = await context.prisma.workerJobLog.create({
    data: {
      queueName: "crawl",
      jobName: "crawl-job-run",
      jobId: job.crawlJobId,
      status: "running",
      payload: job,
      startedAt
    }
  });

  try {
    const crawlJob = await context.prisma.crawlJob.findUniqueOrThrow({ where: { id: job.crawlJobId } });
    if (crawlJob.status === "cancelled") {
      await context.prisma.workerJobLog.update({ where: { id: log.id }, data: { status: "completed", completedAt: new Date() } });
      return;
    }

    await context.prisma.crawlJob.update({
      where: { id: crawlJob.id },
      data: { status: "running", startedAt, completedAt: null, error: null }
    });

    const options = asRecord(crawlJob.options);
    const limit = readPositiveNumber(options.limit, 20);
    const result = await runCrawl(crawlJob.sourcePlatform, crawlJob.sourceRef, crawlJob.accountId, limit, options, context);
    const items = result.items.filter((item) => matchesCrawlOptions(item, options));

    let saved = 0;
    let duplicate = 0;
    let failed = 0;

    for (const [index, item] of items.entries()) {
      try {
        const externalId = makeExternalId(item, index);
        const existing = await context.prisma.crawlResult.findUnique({
          where: {
            platform_sourceRef_externalId: {
              platform: item.platform,
              sourceRef: crawlJob.sourceRef,
              externalId
            }
          }
        });

        const data = {
          crawlJobId: crawlJob.id,
          platform: item.platform,
          sourceRef: crawlJob.sourceRef,
          externalId,
          author: item.author,
          sourceUrl: item.originalUrl,
          originalText: item.text,
          media: item.media as any,
          comments: [] as any,
          links: collectLinks(item.text, context) as any,
          postedAt: item.postedAt,
          status: "new"
        };

        if (existing) {
          duplicate += 1;
          await context.prisma.crawlResult.update({ where: { id: existing.id }, data: { ...data, status: existing.status } });
        } else {
          saved += 1;
          await context.prisma.crawlResult.create({ data });
        }
      } catch (error) {
        failed += 1;
        logger.error("Không lưu được kết quả crawl", {
          crawlJobId: crawlJob.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const status = failed > 0 && saved > 0 ? "partial_success" : failed > 0 ? "failed" : "success";
    await context.prisma.crawlJob.update({
      where: { id: crawlJob.id },
      data: {
        status,
        totalFound: items.length,
        totalSaved: saved,
        totalDuplicate: duplicate,
        totalFailed: failed,
        completedAt: new Date(),
        error: failed > 0 && saved === 0 ? "Không lưu được kết quả crawl." : null
      }
    });

    await context.prisma.activityLog.create({
      data: {
        type: "crawl:complete",
        platform: crawlJob.sourcePlatform,
        targetId: crawlJob.accountId,
        message: `Đã crawl ${items.length} nội dung từ ${crawlJob.sourceRef}, lưu mới ${saved} nội dung.`,
        metadata: { crawlJobId: crawlJob.id, duplicate, failed }
      }
    });

    realtimeBus.emitEvent({
      type: "crawl:complete",
      sourceId: crawlJob.id,
      platform: crawlJob.sourcePlatform as never,
      itemCount: items.length,
      createdAt: new Date().toISOString()
    });

    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "completed", completedAt: new Date() }
    });
  } catch (error) {
    const classified = classifyError(error);
    logger.error("Crawl job lỗi", { crawlJobId: job.crawlJobId, error: classified.message, kind: classified.kind });
    await context.prisma.crawlJob.update({
      where: { id: job.crawlJobId },
      data: { status: "failed", error: classified.message, completedAt: new Date() }
    }).catch(() => undefined);
    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "failed", error: classified.message, completedAt: new Date() }
    });
    throw classified;
  }
}

async function runCrawl(
  sourcePlatform: string,
  sourceRef: string,
  accountId: string | null,
  limit: number,
  options: Record<string, unknown>,
  context: ProcessorContext
): Promise<CrawlResult> {
  if (sourcePlatform === "web") return crawlWebSource(sourceRef, limit);

  const account = accountId
    ? await context.prisma.targetAccount.findUnique({ where: { id: accountId } })
    : await context.prisma.targetAccount.findFirst({
        where: { platform: sourcePlatform, isActive: true, NOT: { health: { in: ["paused", "failed"] } } },
        orderBy: { updatedAt: "desc" }
      });

  if (!account) {
    throw new Error("Cần có một tài khoản đăng đang hoạt động để crawl nguồn này.");
  }
  if (!account.isActive || account.health === "paused") {
    throw new Error("Tài khoản dùng để crawl đang tắt hoặc bị tạm dừng.");
  }
  if (account.platform !== sourcePlatform) {
    throw new Error(`Tài khoản crawl phải cùng nền tảng ${sourcePlatform}.`);
  }

  const adapter = context.registry.getSource(sourcePlatform as never);
  return adapter.crawl({
    account: toSourceRefAdapterAccount(account, sourcePlatform, sourceRef, options),
    limit
  });
}

function toSourceRefAdapterAccount(account: CrawlTargetAccount, sourcePlatform: string, sourceRef: string, options: Record<string, unknown>): AdapterAccount {
  const base = toAdapterAccount(account);
  const handle = extractHandle(sourceRef) || base.handle || sourceRef;
  return {
    ...base,
    platform: sourcePlatform as never,
    handle,
    credentials: {
      ...base.credentials,
      url: sourceRef,
      source: normalizeTelegramSource(sourceRef),
      sourceUsername: handle,
      targetUsername: handle,
      profileUrl: sourceRef.startsWith("http") ? sourceRef : undefined
    },
    config: {
      ...base.config,
      ...options,
      sourceRef
    }
  };
}

async function crawlWebSource(sourceRef: string, limit: number): Promise<CrawlResult> {
  if (!/^https?:\/\//i.test(sourceRef)) {
    throw new Error("Nguồn website phải là URL đầy đủ.");
  }

  const response = await fetch(sourceRef, {
    headers: {
      "user-agent": "ZerunCrawler/1.0"
    }
  });
  if (!response.ok) throw new Error(`Website trả về HTTP ${response.status}.`);

  const html = await response.text();
  const title = decodeHtml(stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? sourceRef));
  const text = decodeHtml(
    stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
    )
  );
  const paragraphs = text
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter((line) => line.length > 40)
    .slice(0, limit);

  const rows = paragraphs.length > 0 ? paragraphs : [normalizeWhitespace(title)];
  return {
    items: rows.map((line, index) => ({
      platform: "web" as never,
      sourceId: sourceRef,
      externalId: stableHash(`${sourceRef}:${index}:${line}`),
      author: new URL(sourceRef).hostname,
      text: line,
      media: [],
      originalUrl: sourceRef,
      metadata: { crawler: "basic-web" }
    }))
  };
}

function matchesCrawlOptions(item: RawSourceItem, options: Record<string, unknown>) {
  if (options.onlyMedia === true && item.media.length === 0) return false;
  if (options.onlyLinks === true && !/https?:\/\/\S+/i.test(item.text)) return false;
  return true;
}

function collectLinks(text: string, context: ProcessorContext) {
  return context.registry.affiliateAdapter.detect(text).map((link) => ({
    originalUrl: link.url,
    network: link.network,
    supported: link.supported,
    position: link.position
  }));
}

function makeExternalId(item: RawSourceItem, index: number) {
  return item.externalId || stableHash(`${item.originalUrl ?? ""}:${item.text}:${index}`);
}

function readPositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 500) : fallback;
}

function extractHandle(sourceRef: string) {
  const trimmed = sourceRef.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed.replace(/^@+/, "");

  try {
    const url = new URL(trimmed);
    const path = url.pathname.split("/").filter(Boolean);
    if (url.hostname.includes("instagram.com") || url.hostname.includes("threads.net")) {
      const first = path[0] ?? "";
      return first.replace(/^@/, "");
    }
    if (url.hostname.includes("x.com") || url.hostname.includes("twitter.com")) {
      return path[0] ?? "";
    }
    if (url.hostname.includes("t.me")) {
      return path[0] ?? "";
    }
    return path[0] ?? url.hostname;
  } catch {
    return trimmed.replace(/^@+/, "");
  }
}

function normalizeTelegramSource(sourceRef: string) {
  if (/^https?:\/\//i.test(sourceRef)) return extractHandle(sourceRef);
  return sourceRef;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "\n");
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stableHash(value: string) {
  return createHash("sha1").update(value).digest("hex");
}
