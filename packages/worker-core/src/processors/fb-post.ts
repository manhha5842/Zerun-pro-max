import { mkdirSync } from "node:fs";
import path from "node:path";
import { AdapterAuthError, AdapterCheckpointError, classifyError, logger } from "@zerun/shared";
import { FacebookAdapter } from "@zerun/adapters";
import { fbPostJobSchema, type FbPostJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { toAdapterAccount } from "./helpers.js";

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? "storage/screenshots";

export async function processFbPost(rawJob: unknown, context: ProcessorContext) {
  const job = fbPostJobSchema.parse(rawJob) satisfies FbPostJob;

  if (job.kind === "comment") {
    return processComment(job, context);
  }
  return processPost(job, context);
}

// ── Post execution ─────────────────────────────────────────────────────────────

async function processPost(job: FbPostJob, context: ProcessorContext) {
  const fbTarget = await context.prisma.fbPostTarget.findUniqueOrThrow({
    where: { id: job.fbPostTargetId },
    include: {
      post: {
        include: {
          media: { orderBy: { sortOrder: "asc" } },
          comments: { orderBy: { sortOrder: "asc" } }
        }
      },
      targetAccount: true
    }
  });

  const post = fbTarget.post;
  const account = toAdapterAccount(fbTarget.targetAccount);

  if (post.type === "story" && post.media.length !== 1) {
    return markTargetFailed(context, fbTarget.id, post.id, "Story requires exactly 1 image");
  }
  if (post.type === "reel" && post.media.length !== 1) {
    return markTargetFailed(context, fbTarget.id, post.id, "Reel requires exactly 1 video");
  }
  if (!fbTarget.targetAccount.isActive || fbTarget.targetAccount.health === "paused") {
    return markTargetFailed(context, fbTarget.id, post.id, "Target account is inactive or paused");
  }

  const attemptNo = (await context.prisma.fbExecution.count({ where: { targetId: fbTarget.id } })) + 1;
  const execution = await context.prisma.fbExecution.create({
    data: { postId: post.id, targetId: fbTarget.id, attemptNo, status: "running" }
  });

  await context.prisma.fbPostTarget.update({ where: { id: fbTarget.id }, data: { status: "publishing" } });
  await context.prisma.fbPost.update({ where: { id: post.id }, data: { status: "publishing" } });

  const adapter = new FacebookAdapter();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  try {
    const result = await adapter.publishFb({
      account,
      type: post.type as "feed" | "story" | "reel",
      caption: post.caption ?? undefined,
      mediaPaths: post.media.map((m) => m.localPath),
      screenshotDir: SCREENSHOT_DIR
    });

    await context.prisma.fbExecution.update({
      where: { id: execution.id },
      data: { status: "success", postUrl: result.postUrl, completedAt: new Date() }
    });
    await context.prisma.fbPostTarget.update({ where: { id: fbTarget.id }, data: { status: "published" } });
    await maybeMarkPostPublished(context, post.id);

    // Schedule comments with per-comment delay
    if (result.postUrl && post.comments.length > 0) {
      let accumulatedMs = 0;
      for (const comment of post.comments) {
        accumulatedMs += comment.delayMinutes * 60_000;
        await context.enqueueFbPost(
          { version: 1, kind: "comment", fbPostTargetId: fbTarget.id, postUrl: result.postUrl, commentText: comment.text },
          accumulatedMs
        );
      }
    }

    logger.info("FB post published", { postId: post.id, targetId: fbTarget.id, url: result.postUrl });
  } catch (error) {
    await handlePostError(context, error, execution.id, fbTarget.id, fbTarget.targetAccountId, post.id);
  }
}

// ── Comment execution ──────────────────────────────────────────────────────────

async function processComment(job: FbPostJob, context: ProcessorContext) {
  if (!job.postUrl || !job.commentText) {
    logger.warn("FB comment job missing postUrl or commentText, skipping", { job });
    return;
  }

  const fbTarget = await context.prisma.fbPostTarget.findUniqueOrThrow({
    where: { id: job.fbPostTargetId },
    include: { targetAccount: true }
  });

  const account = toAdapterAccount(fbTarget.targetAccount);
  const adapter = new FacebookAdapter();

  try {
    await adapter.addComment({
      account,
      postUrl: job.postUrl,
      text: job.commentText,
      screenshotDir: SCREENSHOT_DIR
    });
    logger.info("FB comment posted", { targetId: fbTarget.id, postUrl: job.postUrl });
  } catch (error) {
    const classified = classifyError(error);
    logger.error("FB comment failed", { targetId: fbTarget.id, error: classified.message });

    if (classified instanceof AdapterAuthError || classified instanceof AdapterCheckpointError || classified.kind === "adapter_auth" || classified.kind === "adapter_checkpoint") {
      await context.prisma.targetAccount.update({ where: { id: fbTarget.targetAccountId }, data: { health: "paused" } }).catch(() => undefined);
      return; // Don't retry auth errors
    }
    throw classified;
  }
}

// ── Error handling ─────────────────────────────────────────────────────────────

async function handlePostError(
  context: ProcessorContext,
  error: unknown,
  executionId: string,
  targetId: string,
  targetAccountId: string,
  postId: string
) {
  const classified = classifyError(error);
  logger.error("FB post failed", { targetId, error: classified.message, kind: (classified as any).kind });

  const screenshotPath = path.join(SCREENSHOT_DIR, `fb-exec-${executionId}-fail.png`);

  if (classified instanceof AdapterAuthError || classified instanceof AdapterCheckpointError || classified.kind === "adapter_auth" || classified.kind === "adapter_checkpoint") {
    await context.prisma.targetAccount.update({ where: { id: targetAccountId }, data: { health: "paused" } }).catch(() => undefined);
    await context.prisma.fbExecution.update({
      where: { id: executionId },
      data: { status: "failed", errorMessage: classified.message, screenshotPath, completedAt: new Date() }
    });
    await context.prisma.fbPostTarget.update({ where: { id: targetId }, data: { status: "failed" } });
    await maybeMarkPostFailed(context, postId);
    return; // No retry for auth errors
  }

  await context.prisma.fbExecution.update({
    where: { id: executionId },
    data: { status: "failed", errorMessage: classified.message, screenshotPath, completedAt: new Date() }
  });
  throw classified;
}

async function markTargetFailed(context: ProcessorContext, targetId: string, postId: string, reason: string) {
  await context.prisma.fbPostTarget.update({ where: { id: targetId }, data: { status: "failed" } });
  await context.prisma.fbExecution.create({
    data: { postId, targetId, status: "failed", errorMessage: reason, completedAt: new Date() }
  });
  await maybeMarkPostFailed(context, postId);
}

async function maybeMarkPostPublished(context: ProcessorContext, postId: string) {
  const targets = await context.prisma.fbPostTarget.findMany({ where: { postId } });
  if (targets.every((t) => t.status === "published" || t.status === "skipped")) {
    await context.prisma.fbPost.update({ where: { id: postId }, data: { status: "published" } });
  }
}

async function maybeMarkPostFailed(context: ProcessorContext, postId: string) {
  const targets = await context.prisma.fbPostTarget.findMany({ where: { postId } });
  const allSettled = targets.every((t) => ["published", "failed", "skipped"].includes(t.status));
  const anyFailed = targets.some((t) => t.status === "failed");
  if (allSettled && anyFailed) {
    await context.prisma.fbPost.update({ where: { id: postId }, data: { status: "failed" } });
  }
}
