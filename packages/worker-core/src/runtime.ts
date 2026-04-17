import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { createRealAdapterRegistry, type AdapterRegistry } from "@zerun/adapters";
import { prisma as defaultPrisma, type PrismaClient } from "@zerun/db";
import { logger } from "@zerun/shared";
import { processContent } from "./processors/content-process.js";
import { processSourceCrawl } from "./processors/source-crawl.js";
import { processPublish } from "./processors/publish.js";
import { processScheduleRelease } from "./processors/schedule.js";
import { processPlatformHealth } from "./processors/platform-health.js";
import { processFbPost } from "./processors/fb-post.js";
import {
  JobName,
  QueueName,
  type ContentProcessJob,
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
};

export type WorkerCore = Awaited<ReturnType<typeof createWorkerCore>>;

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

export async function createWorkerCore(options: WorkerCoreOptions = {}) {
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
      })
  };

  async function start() {
    workers.push(
      new Worker(QueueName.SourceCrawl, (job) => processSourceCrawl(job.data, context), { connection, concurrency: 2 }),
      new Worker(QueueName.ContentProcess, (job) => processContent(job.data, context), { connection, concurrency: 4 }),
      new Worker(QueueName.Publish, (job) => processPublish(job.data, context), { connection, concurrency: 2 }),
      new Worker(QueueName.Schedule, (job) => processScheduleRelease(job.data, context), { connection, concurrency: 2 }),
      new Worker(QueueName.PlatformHealth, (job) => processPlatformHealth(job.data, context), { connection, concurrency: 3 }),
      // Sequential: concurrency 1 to protect Facebook accounts
      new Worker(QueueName.FbPost, (job) => processFbPost(job.data, context), { connection, concurrency: 1 })
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
        jobId: `crawl:${sourceId}:${Date.now()}`
      }),
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
        { version: 1, fbPostTargetId } satisfies FbPostJob,
        { ...defaultJobOptions, jobId: `fb-post:${fbPostTargetId}`, delay: Math.max(0, scheduledAt.getTime() - Date.now()) }
      )
  };
}

function createQueues(connection: IORedis) {
  return {
    [QueueName.SourceCrawl]: new Queue(QueueName.SourceCrawl, { connection, defaultJobOptions }),
    [QueueName.ContentProcess]: new Queue(QueueName.ContentProcess, { connection, defaultJobOptions }),
    [QueueName.LinkConvert]: new Queue(QueueName.LinkConvert, { connection, defaultJobOptions }),
    [QueueName.Publish]: new Queue(QueueName.Publish, { connection, defaultJobOptions }),
    [QueueName.Schedule]: new Queue(QueueName.Schedule, { connection, defaultJobOptions }),
    [QueueName.PlatformHealth]: new Queue(QueueName.PlatformHealth, { connection, defaultJobOptions }),
    [QueueName.Maintenance]: new Queue(QueueName.Maintenance, { connection, defaultJobOptions }),
    [QueueName.FbPost]: new Queue(QueueName.FbPost, { connection, defaultJobOptions })
  };
}

function stableJob(job: Record<string, unknown>): JobsOptions {
  return {
    ...defaultJobOptions,
    jobId: Object.entries(job)
      .map(([key, value]) => `${key}:${String(value)}`)
      .join("|")
  };
}
