import { z } from "zod";

export const QueueName = {
  CrawlJob: "crawl",
  SourceCrawl: "source-crawl",
  ContentProcess: "content-process",
  LinkConvert: "link-convert",
  Publish: "publish",
  Schedule: "schedule",
  PlatformHealth: "platform-health",
  Maintenance: "maintenance",
  FbPost: "fb-post",
  Comment: "comment-execute"
} as const;

export const JobName = {
  CrawlJobRun: "crawl-job-run",
  SourceCrawl: "source.crawl",
  ContentProcess: "content.process",
  PublishExecute: "publish.execute",
  ScheduleRelease: "schedule.release",
  PlatformHealthCheck: "platform.health.check",
  FbPostExecute: "fb.post.execute",
  CommentExecute: "comment.execute",
  MaintenanceCleanup: "maintenance.cleanup"
} as const;

export const sourceCrawlJobSchema = z.object({
  version: z.literal(1),
  sourceId: z.string().min(1),
  requestedBy: z.enum(["system", "admin"]),
  requestedByUserId: z.string().optional(),
  crawlWindow: z
    .object({
      from: z.string().optional(),
      to: z.string().optional()
    })
    .optional()
});

export const crawlJobRunSchema = z.object({
  version: z.literal(1),
  crawlJobId: z.string().min(1)
});

export const contentProcessJobSchema = z.object({
  version: z.literal(1),
  contentId: z.string().min(1)
});

export const publishExecuteJobSchema = z.object({
  version: z.literal(1),
  contentId: z.string().min(1),
  targetId: z.string().min(1),
  targetChannelId: z.string().min(1).optional(),
  requestedBy: z.enum(["system", "admin"])
});

export const scheduleReleaseJobSchema = z.object({
  version: z.literal(1),
  scheduleId: z.string().min(1)
});

export const platformHealthJobSchema = z.object({
  version: z.literal(1),
  accountId: z.string().min(1),
  accountKind: z.enum(["source", "target"])
});

export const fbPostJobSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["post", "comment"]).default("post"),
  fbPostTargetId: z.string().min(1),
  // Used only when kind === "comment"
  postUrl: z.string().optional(),
  commentText: z.string().optional()
});

export const commentExecuteJobSchema = z.object({
  version: z.literal(1),
  commentQueueId: z.string().min(1)
});

export const maintenanceJobSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["media", "orphan", "all"]).default("all"),
  retentionDays: z.number().int().positive().optional(),
  dryRun: z.boolean().default(false)
});

export type SourceCrawlJob = z.infer<typeof sourceCrawlJobSchema>;
export type CrawlJobRunJob = z.infer<typeof crawlJobRunSchema>;
export type ContentProcessJob = z.infer<typeof contentProcessJobSchema>;
export type PublishExecuteJob = z.infer<typeof publishExecuteJobSchema>;
export type ScheduleReleaseJob = z.infer<typeof scheduleReleaseJobSchema>;
export type PlatformHealthJob = z.infer<typeof platformHealthJobSchema>;
export type FbPostJob = z.infer<typeof fbPostJobSchema>;
export type CommentExecuteJob = z.infer<typeof commentExecuteJobSchema>;
export type MaintenanceJob = z.infer<typeof maintenanceJobSchema>;
