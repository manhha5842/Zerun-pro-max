import type { AdapterRegistry } from "@zerun/adapters";
import type { PrismaClient } from "@zerun/db";
import type { CommentExecuteJob, ContentProcessJob, FbPostJob, PublishExecuteJob, ScheduleReleaseJob } from "../types.js";

export type ProcessorContext = {
  prisma: PrismaClient;
  registry: AdapterRegistry;
  enqueueContentProcess: (job: ContentProcessJob) => Promise<unknown>;
  enqueuePublish: (job: PublishExecuteJob) => Promise<unknown>;
  enqueueScheduleRelease: (job: ScheduleReleaseJob, delay?: number) => Promise<unknown>;
  enqueueFbPost: (job: FbPostJob, delay?: number) => Promise<unknown>;
  enqueueComment: (job: CommentExecuteJob, delay?: number) => Promise<unknown>;
};
