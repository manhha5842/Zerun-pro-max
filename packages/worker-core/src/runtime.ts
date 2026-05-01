import { randomUUID } from "node:crypto";
import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { createRealAdapterRegistry, type AdapterRegistry } from "@zerun/adapters";
import { prisma as defaultPrisma, type PrismaClient } from "@zerun/db";
import { logger } from "@zerun/shared";
import { processContent } from "./processors/content-process.js";
import { processCrawlJob } from "./processors/crawl-job.js";
import { processSourceCrawl } from "./processors/source-crawl.js";
import { processPublish } from "./processors/publish.js";
import { processScheduleRelease } from "./processors/schedule.js";
import { processPlatformHealth } from "./processors/platform-health.js";
import { processFbPost } from "./processors/fb-post.js";
import { processComment } from "./processors/comment.js";
import {
  JobName,
  QueueName,
  type CommentExecuteJob,
  type ContentProcessJob,
  type CrawlJobRunJob,
  type FbPostJob,
  type PlatformHealthJob,
  type PublishExecuteJob,
  type ScheduleReleaseJob,
  type SourceCrawlJob
} from "./types.js";

export type WorkerCoreOptions = {
  redisUrl?: string;
  prisma?: PrismaClient;
  registry?: AdapterRegistry;
  startWorkers?: boolean;
  queueMode?: "local" | "redis";
};

type QueueNameValue = (typeof QueueName)[keyof typeof QueueName];

export type WorkerQueuedJob = {
  id?: string | number;
  name: string;
  data: unknown;
  remove: () => Promise<unknown>;
};

export type WorkerQueue = {
  add: (name: string, data: any, options?: JobsOptions) => Promise<WorkerQueuedJob>;
  getJobs: (states?: any, start?: number, end?: number) => Promise<WorkerQueuedJob[]>;
  close: () => Promise<unknown>;
};

export type WorkerCore = {
  queues: Record<QueueNameValue, WorkerQueue>;
  registry: AdapterRegistry;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  triggerCrawl: (sourceId: string, requestedBy?: SourceCrawlJob["requestedBy"]) => Promise<WorkerQueuedJob>;
  runCrawlJob: (crawlJobId: string) => Promise<WorkerQueuedJob>;
  processContent: (contentId: string) => Promise<WorkerQueuedJob>;
  publishNow: (contentId: string, targetId: string, requestedBy?: PublishExecuteJob["requestedBy"]) => Promise<WorkerQueuedJob>;
  scheduleRelease: (scheduleId: string, scheduledAt: Date) => Promise<WorkerQueuedJob>;
  testAccount: (accountId: string, accountKind: PlatformHealthJob["accountKind"]) => Promise<WorkerQueuedJob>;
  scheduleFbPost: (fbPostTargetId: string, scheduledAt: Date) => Promise<WorkerQueuedJob>;
  scheduleComment: (commentQueueId: string, scheduledAt: Date) => Promise<WorkerQueuedJob>;
};

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5_000
  },
  removeOnComplete: {
    age: 60 * 60 * 24,
    count: 1000
  },
  removeOnFail: {
    age: 60 * 60 * 24 * 7
  }
};

type LocalJobState = "waiting" | "delayed" | "active" | "completed" | "failed" | "removed";
type LocalProcessor = (job: LocalQueueJob) => Promise<unknown>;

class LocalQueueJob {
  readonly id: string;
  readonly name: string;
  readonly data: Record<string, unknown>;
  attemptsMade = 0;
  state: LocalJobState = "waiting";
  timer: NodeJS.Timeout | undefined;
  private readonly queue: LocalQueue;

  constructor(queue: LocalQueue, name: string, data: Record<string, unknown>, id?: string) {
    this.queue = queue;
    this.name = name;
    this.data = data;
    this.id = id ?? randomUUID();
  }

  async remove() {
    if (this.timer) clearTimeout(this.timer);
    this.state = "removed";
    this.queue.delete(this.id);
  }
}

class LocalQueue {
  private readonly jobs = new Map<string, LocalQueueJob>();
  private processor: LocalProcessor | undefined;

  constructor(readonly name: string) {}

  setProcessor(processor: LocalProcessor) {
    this.processor = processor;
  }

  async add(name: string, data: Record<string, unknown>, options: JobsOptions = {}) {
    const id = options.jobId ? String(options.jobId) : undefined;
    const existing = id ? this.jobs.get(id) : undefined;
    if (existing && !["completed", "failed", "removed"].includes(existing.state)) return existing;

    const job = new LocalQueueJob(this, name, data, id);
    this.jobs.set(job.id, job);
    this.schedule(job, Math.max(0, Number(options.delay ?? 0)), options);
    return job;
  }

  async getJobs(states: string[] = [], _start?: number, _end?: number) {
    return Array.from(this.jobs.values()).filter((job) => states.includes(job.state));
  }

  async close() {
    for (const job of this.jobs.values()) {
      if (job.timer) clearTimeout(job.timer);
    }
    this.jobs.clear();
  }

  delete(id: string) {
    this.jobs.delete(id);
  }

  private schedule(job: LocalQueueJob, delay: number, options: JobsOptions) {
    job.state = delay > 0 ? "delayed" : "waiting";
    const nextDelay = Math.min(delay, 2_147_483_647);
    job.timer = setTimeout(() => void this.run(job, options), nextDelay);
  }

  private async run(job: LocalQueueJob, options: JobsOptions) {
    if (job.state === "removed") return;
    const processor = this.processor;
    if (!processor) return;

    job.state = "active";
    job.attemptsMade += 1;
    try {
      await processor(job);
      job.state = "completed";
      setTimeout(() => this.jobs.delete(job.id), 60_000);
    } catch (error) {
      const maxAttempts = Math.max(1, Number(options.attempts ?? defaultJobOptions.attempts ?? 1));
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Local worker job failed", { queue: this.name, jobId: job.id, error: message });
      if (job.attemptsMade < maxAttempts) {
        this.schedule(job, resolveBackoffDelay(options, job.attemptsMade), options);
      } else {
        job.state = "failed";
      }
    }
  }
}

type LocalQueues = ReturnType<typeof createLocalQueues>;

async function createLocalWorkerCore(options: WorkerCoreOptions = {}): Promise<WorkerCore> {
  const prisma = options.prisma ?? defaultPrisma;
  const registry = options.registry ?? createRealAdapterRegistry();
  const queues = createLocalQueues();

  const context = {
    prisma,
    registry,
    enqueueContentProcess: (job: ContentProcessJob) => queues[QueueName.ContentProcess].add(JobName.ContentProcess, job, stableJob(job)),
    enqueuePublish: (job: PublishExecuteJob) => queues[QueueName.Publish].add(JobName.PublishExecute, job, stableJob(job)),
    enqueueScheduleRelease: (job: ScheduleReleaseJob, delay?: number) =>
      queues[QueueName.Schedule].add(JobName.ScheduleRelease, job, {
        ...stableJob(job),
        delay: Math.max(0, delay ?? 0)
      }),
    enqueueFbPost: (job: FbPostJob, delay?: number) =>
      queues[QueueName.FbPost].add(JobName.FbPostExecute, job, {
        ...stableJob(job),
        delay: Math.max(0, delay ?? 0)
      }),
    enqueueComment: (job: CommentExecuteJob, delay?: number) =>
      queues[QueueName.Comment].add(JobName.CommentExecute, job, {
        ...stableJob(job),
        delay: Math.max(0, delay ?? 0)
      })
  };

  async function start() {
    wireLocalProcessors(queues, context);
    await recoverLocalJobs(prisma, context);
    logger.info("Worker Core local đã khởi động", { queues: Object.values(QueueName) });
  }

  async function stop() {
    await Promise.allSettled(Object.values(queues).map((queue) => queue.close()));
    logger.info("Worker Core local đã dừng");
  }

  if (options.startWorkers ?? process.env.ENABLE_WORKERS !== "false") {
    await start();
  }

  return {
    queues,
    registry,
    start,
    stop,
    triggerCrawl: (sourceId: string, requestedBy: SourceCrawlJob["requestedBy"] = "admin") =>
      queues[QueueName.SourceCrawl].add(JobName.SourceCrawl, { version: 1, sourceId, requestedBy } satisfies SourceCrawlJob, {
        ...defaultJobOptions,
        jobId: `crawl_${sanitizeJobIdToken(sourceId)}_${Date.now()}`
      }),
    runCrawlJob: (crawlJobId: string) =>
      queues[QueueName.CrawlJob].add(
        JobName.CrawlJobRun,
        { version: 1, crawlJobId } satisfies CrawlJobRunJob,
        { ...defaultJobOptions, jobId: `crawl_job_${sanitizeJobIdToken(crawlJobId)}_${Date.now()}` }
      ),
    processContent: (contentId: string) =>
      queues[QueueName.ContentProcess].add(JobName.ContentProcess, { version: 1, contentId } satisfies ContentProcessJob, stableJob({ version: 1, contentId })),
    publishNow: (contentId: string, targetId: string, requestedBy: PublishExecuteJob["requestedBy"] = "admin") =>
      queues[QueueName.Publish].add(JobName.PublishExecute, { version: 1, contentId, targetId, requestedBy } satisfies PublishExecuteJob, stableJob({ version: 1, contentId, targetId, requestedBy })),
    scheduleRelease: (scheduleId: string, scheduledAt: Date) =>
      queues[QueueName.Schedule].add(JobName.ScheduleRelease, { version: 1, scheduleId } satisfies ScheduleReleaseJob, {
        ...stableJob({ version: 1, scheduleId }),
        delay: Math.max(0, scheduledAt.getTime() - Date.now())
      }),
    testAccount: (accountId: string, accountKind: PlatformHealthJob["accountKind"]) =>
      queues[QueueName.PlatformHealth].add(JobName.PlatformHealthCheck, { version: 1, accountId, accountKind } satisfies PlatformHealthJob, stableJob({ version: 1, accountId, accountKind })),
    scheduleFbPost: (fbPostTargetId: string, scheduledAt: Date) =>
      queues[QueueName.FbPost].add(
        JobName.FbPostExecute,
        { version: 1, kind: "post", fbPostTargetId } satisfies FbPostJob,
        { ...defaultJobOptions, jobId: `fb_post_${sanitizeJobIdToken(fbPostTargetId)}`, delay: Math.max(0, scheduledAt.getTime() - Date.now()) }
      ),
    scheduleComment: (commentQueueId: string, scheduledAt: Date) =>
      queues[QueueName.Comment].add(
        JobName.CommentExecute,
        { version: 1, commentQueueId } satisfies CommentExecuteJob,
        { ...defaultJobOptions, jobId: `comment_${sanitizeJobIdToken(commentQueueId)}`, delay: Math.max(0, scheduledAt.getTime() - Date.now()) }
      )
  };
}

export async function createWorkerCore(options: WorkerCoreOptions = {}): Promise<WorkerCore> {
  const queueMode = options.queueMode ?? process.env.ZERUN_QUEUE_MODE ?? "local";
  if (queueMode !== "redis") {
    return createLocalWorkerCore(options);
  }
  return createRedisWorkerCore(options);
}

async function createRedisWorkerCore(options: WorkerCoreOptions = {}): Promise<WorkerCore> {
  const prisma = options.prisma ?? defaultPrisma;
  const registry = options.registry ?? createRealAdapterRegistry();
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queues = createQueues(connection);
  const queueEvents = Object.values(QueueName).map((name) => new QueueEvents(name, { connection }));
  const workers: Worker[] = [];

  const context = {
    prisma,
    registry,
    enqueueContentProcess: (job: ContentProcessJob) => queues[QueueName.ContentProcess].add(JobName.ContentProcess, job, stableJob(job)),
    enqueuePublish: (job: PublishExecuteJob) => queues[QueueName.Publish].add(JobName.PublishExecute, job, stableJob(job)),
    enqueueScheduleRelease: (job: ScheduleReleaseJob, delay?: number) =>
      queues[QueueName.Schedule].add(JobName.ScheduleRelease, job, {
        ...stableJob(job),
        delay: Math.max(0, delay ?? 0)
      }),
    enqueueFbPost: (job: FbPostJob, delay?: number) =>
      queues[QueueName.FbPost].add(JobName.FbPostExecute, job, {
        ...stableJob(job),
        delay: Math.max(0, delay ?? 0)
      }),
    enqueueComment: (job: CommentExecuteJob, delay?: number) =>
      queues[QueueName.Comment].add(JobName.CommentExecute, job, {
        ...stableJob(job),
        delay: Math.max(0, delay ?? 0)
      })
  };

  async function start() {
    workers.push(
      new Worker(QueueName.CrawlJob, (job) => processCrawlJob(job.data, context), { connection, concurrency: 2 }),
      new Worker(QueueName.SourceCrawl, (job) => processSourceCrawl(job.data, context), { connection, concurrency: 2 }),
      new Worker(QueueName.ContentProcess, (job) => processContent(job.data, context), { connection, concurrency: 4 }),
      new Worker(QueueName.Publish, (job) => processPublish(job.data, context), { connection, concurrency: 2 }),
      new Worker(QueueName.Schedule, (job) => processScheduleRelease(job.data, context), { connection, concurrency: 2 }),
      new Worker(QueueName.PlatformHealth, (job) => processPlatformHealth(job.data, context), { connection, concurrency: 3 }),
      // Sequential: concurrency 1 to protect Facebook accounts
      new Worker(QueueName.FbPost, (job) => processFbPost(job.data, context), { connection, concurrency: 1 }),
      new Worker(QueueName.Comment, (job) => processComment(job.data, context), { connection, concurrency: 1 })
    );
    workers.forEach((worker) => {
      worker.on("failed", (job, error) => logger.error("Worker job failed", { queue: worker.name, jobId: job?.id, error: error.message }));
    });
    logger.info("Worker Core đã khởi động", { queues: Object.values(QueueName) });
  }

  async function stop() {
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await Promise.allSettled(queueEvents.map((event) => event.close()));
    await Promise.allSettled(Object.values(queues).map((queue) => queue.close()));
    await connection.quit();
    logger.info("Worker Core đã dừng");
  }

  if (options.startWorkers ?? process.env.ENABLE_WORKERS !== "false") {
    await start();
  }

  return {
    queues,
    registry,
    start,
    stop,
    triggerCrawl: (sourceId: string, requestedBy: SourceCrawlJob["requestedBy"] = "admin") =>
      queues[QueueName.SourceCrawl].add(JobName.SourceCrawl, { version: 1, sourceId, requestedBy } satisfies SourceCrawlJob, {
        ...defaultJobOptions,
        jobId: `crawl_${sanitizeJobIdToken(sourceId)}_${Date.now()}`
      }),
    runCrawlJob: (crawlJobId: string) =>
      queues[QueueName.CrawlJob].add(
        JobName.CrawlJobRun,
        { version: 1, crawlJobId } satisfies CrawlJobRunJob,
        { ...defaultJobOptions, jobId: `crawl_job_${sanitizeJobIdToken(crawlJobId)}_${Date.now()}` }
      ),
    processContent: (contentId: string) =>
      queues[QueueName.ContentProcess].add(JobName.ContentProcess, { version: 1, contentId } satisfies ContentProcessJob, stableJob({ version: 1, contentId })),
    publishNow: (contentId: string, targetId: string, requestedBy: PublishExecuteJob["requestedBy"] = "admin") =>
      queues[QueueName.Publish].add(JobName.PublishExecute, { version: 1, contentId, targetId, requestedBy } satisfies PublishExecuteJob, stableJob({ version: 1, contentId, targetId, requestedBy })),
    scheduleRelease: (scheduleId: string, scheduledAt: Date) =>
      queues[QueueName.Schedule].add(JobName.ScheduleRelease, { version: 1, scheduleId } satisfies ScheduleReleaseJob, {
        ...stableJob({ version: 1, scheduleId }),
        delay: Math.max(0, scheduledAt.getTime() - Date.now())
      }),
    testAccount: (accountId: string, accountKind: PlatformHealthJob["accountKind"]) =>
      queues[QueueName.PlatformHealth].add(JobName.PlatformHealthCheck, { version: 1, accountId, accountKind } satisfies PlatformHealthJob, stableJob({ version: 1, accountId, accountKind })),
    scheduleFbPost: (fbPostTargetId: string, scheduledAt: Date) =>
      queues[QueueName.FbPost].add(
        JobName.FbPostExecute,
        { version: 1, kind: "post", fbPostTargetId } satisfies FbPostJob,
        { ...defaultJobOptions, jobId: `fb_post_${sanitizeJobIdToken(fbPostTargetId)}`, delay: Math.max(0, scheduledAt.getTime() - Date.now()) }
      ),
    scheduleComment: (commentQueueId: string, scheduledAt: Date) =>
      queues[QueueName.Comment].add(
        JobName.CommentExecute,
        { version: 1, commentQueueId } satisfies CommentExecuteJob,
        { ...defaultJobOptions, jobId: `comment_${sanitizeJobIdToken(commentQueueId)}`, delay: Math.max(0, scheduledAt.getTime() - Date.now()) }
      )
  };
}

function createQueues(connection: IORedis) {
  return {
    [QueueName.CrawlJob]: new Queue(QueueName.CrawlJob, { connection, defaultJobOptions }),
    [QueueName.SourceCrawl]: new Queue(QueueName.SourceCrawl, { connection, defaultJobOptions }),
    [QueueName.ContentProcess]: new Queue(QueueName.ContentProcess, { connection, defaultJobOptions }),
    [QueueName.LinkConvert]: new Queue(QueueName.LinkConvert, { connection, defaultJobOptions }),
    [QueueName.Publish]: new Queue(QueueName.Publish, { connection, defaultJobOptions }),
    [QueueName.Schedule]: new Queue(QueueName.Schedule, { connection, defaultJobOptions }),
    [QueueName.PlatformHealth]: new Queue(QueueName.PlatformHealth, { connection, defaultJobOptions }),
    [QueueName.Maintenance]: new Queue(QueueName.Maintenance, { connection, defaultJobOptions }),
    [QueueName.FbPost]: new Queue(QueueName.FbPost, { connection, defaultJobOptions }),
    [QueueName.Comment]: new Queue(QueueName.Comment, { connection, defaultJobOptions })
  };
}

function createLocalQueues() {
  return {
    [QueueName.CrawlJob]: new LocalQueue(QueueName.CrawlJob),
    [QueueName.SourceCrawl]: new LocalQueue(QueueName.SourceCrawl),
    [QueueName.ContentProcess]: new LocalQueue(QueueName.ContentProcess),
    [QueueName.LinkConvert]: new LocalQueue(QueueName.LinkConvert),
    [QueueName.Publish]: new LocalQueue(QueueName.Publish),
    [QueueName.Schedule]: new LocalQueue(QueueName.Schedule),
    [QueueName.PlatformHealth]: new LocalQueue(QueueName.PlatformHealth),
    [QueueName.Maintenance]: new LocalQueue(QueueName.Maintenance),
    [QueueName.FbPost]: new LocalQueue(QueueName.FbPost),
    [QueueName.Comment]: new LocalQueue(QueueName.Comment)
  };
}

function wireLocalProcessors(queues: LocalQueues, context: any) {
  queues[QueueName.CrawlJob].setProcessor((job) => processCrawlJob(job.data as CrawlJobRunJob, context));
  queues[QueueName.SourceCrawl].setProcessor((job) => processSourceCrawl(job.data as SourceCrawlJob, context));
  queues[QueueName.ContentProcess].setProcessor((job) => processContent(job.data as ContentProcessJob, context));
  queues[QueueName.Publish].setProcessor((job) => processPublish(job.data as PublishExecuteJob, context));
  queues[QueueName.Schedule].setProcessor((job) => processScheduleRelease(job.data as ScheduleReleaseJob, context));
  queues[QueueName.PlatformHealth].setProcessor((job) => processPlatformHealth(job.data as PlatformHealthJob, context));
  queues[QueueName.FbPost].setProcessor((job) => processFbPost(job.data as FbPostJob, context));
  queues[QueueName.Comment].setProcessor((job) => processComment(job.data as CommentExecuteJob, context));
}

async function recoverLocalJobs(prisma: PrismaClient, context: {
  enqueueScheduleRelease: (job: ScheduleReleaseJob, delay?: number) => Promise<unknown>;
  enqueueFbPost: (job: FbPostJob, delay?: number) => Promise<unknown>;
  enqueueComment: (job: CommentExecuteJob, delay?: number) => Promise<unknown>;
}) {
  const [schedules, comments, fbTargets] = await Promise.all([
    prisma.schedule.findMany({ where: { status: "scheduled" }, select: { id: true, scheduledAt: true } }),
    prisma.commentQueue.findMany({ where: { status: "pending" }, select: { id: true, scheduledAt: true } }),
    prisma.fbPostTarget.findMany({
      where: {
        status: { in: ["pending", "scheduled", "publishing"] },
        scheduledAt: { not: null }
      },
      select: { id: true, scheduledAt: true, status: true }
    })
  ]);

  const publishingIds = fbTargets.filter((target) => target.status === "publishing").map((target) => target.id);
  if (publishingIds.length > 0) {
    await prisma.fbPostTarget.updateMany({ where: { id: { in: publishingIds } }, data: { status: "scheduled" } });
  }

  await Promise.all([
    ...schedules.map((schedule) =>
      context.enqueueScheduleRelease({ version: 1, scheduleId: schedule.id }, Math.max(0, schedule.scheduledAt.getTime() - Date.now()))
    ),
    ...comments.map((comment) =>
      context.enqueueComment({ version: 1, commentQueueId: comment.id }, Math.max(0, comment.scheduledAt.getTime() - Date.now()))
    ),
    ...fbTargets
      .filter((target): target is { id: string; scheduledAt: Date; status: string } => Boolean(target.scheduledAt))
      .map((target) =>
        context.enqueueFbPost({ version: 1, kind: "post", fbPostTargetId: target.id }, Math.max(0, target.scheduledAt.getTime() - Date.now()))
      )
  ]);

  logger.info("Đã khôi phục job local", {
    schedules: schedules.length,
    comments: comments.length,
    facebookTargets: fbTargets.length
  });
}

function stableJob(job: Record<string, unknown>): JobsOptions {
  return {
    ...defaultJobOptions,
    jobId: Object.entries(job)
      .map(([key, value]) => `${sanitizeJobIdToken(key)}_${sanitizeJobIdToken(String(value))}`)
      .join("__")
  };
}

function sanitizeJobIdToken(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function resolveBackoffDelay(options: JobsOptions, attemptsMade: number) {
  const backoff = options.backoff ?? defaultJobOptions.backoff;
  if (typeof backoff === "number") return backoff;
  if (backoff && typeof backoff === "object") {
    const delay = Number(backoff.delay ?? 0);
    return backoff.type === "exponential" ? delay * Math.max(1, 2 ** (attemptsMade - 1)) : delay;
  }
  return 0;
}
