import { formatCaptionForPlatform } from "@zerun/core";
import { AdapterAuthError, AdapterCheckpointError, classifyError, logger, realtimeBus } from "@zerun/shared";
import type { ThreadsLinkPreviewMode, ThreadsPublishOptions, ThreadsSpoilerMode } from "@zerun/adapters";
import { publishExecuteJobSchema, type PublishExecuteJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { ensureLocalMediaAssets, mapMediaAssets, normalizeMediaPaths, toAdapterAccount } from "./helpers.js";
import { sendAlert } from "../notify/alert.js";

// BullMQ handles retries automatically via defaultJobOptions in runtime.ts:
// - attempts: 3 (max 3 total attempts)
// - backoff: exponential, starting at 5_000ms (approx 5s, 10s, 20s for attempts 1-3)
// If you need finer control (1s/2s/4s), set per-job options when enqueuing.

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeThreadsPublishOptions(value: unknown): ThreadsPublishOptions | undefined {
  if (!isRecord(value)) return undefined;

  const linkPreviewMode = normalizeEnum<ThreadsLinkPreviewMode>(value.linkPreviewMode, ["default", "remove_preview", "move_links_to_comment"]);
  const spoilerMode = normalizeEnum<ThreadsSpoilerMode>(value.spoilerMode, ["none", "all_text"]);
  const replyControl = normalizeEnum<NonNullable<ThreadsPublishOptions["replyControl"]>>(value.replyControl, ["everyone", "accounts_you_follow", "mentioned_only"]);
  const topicTag = typeof value.topicTag === "string" ? value.topicTag.trim().replace(/^#/, "") : undefined;

  const options: ThreadsPublishOptions = {
    ...(topicTag ? { topicTag } : {}),
    ...(linkPreviewMode ? { linkPreviewMode } : {}),
    ...(spoilerMode ? { spoilerMode } : {}),
    ...(replyControl ? { replyControl } : {}),
    ...(typeof value.spoilerMedia === "boolean" ? { spoilerMedia: value.spoilerMedia } : {}),
    ...(typeof value.ghostPost === "boolean" ? { ghostPost: value.ghostPost } : {}),
    ...(typeof value.enableReplyApprovals === "boolean" ? { enableReplyApprovals: value.enableReplyApprovals } : {})
  };

  return Object.keys(options).length > 0 ? options : undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : undefined;
}

function prepareThreadsPublishText(text: string, comment: string, options?: ThreadsPublishOptions) {
  if (options?.linkPreviewMode !== "move_links_to_comment") {
    return { text, commentText: comment };
  }

  const links = text.match(URL_PATTERN) ?? [];
  if (links.length === 0) return { text, commentText: comment };

  const strippedText = text
    .replace(URL_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const linkComment = `Link: ${links.join("\n")}`;
  return {
    text: strippedText,
    commentText: [comment.trim(), linkComment].filter(Boolean).join("\n\n")
  };
}

function applyTargetChannelDestination(
  account: {
    id: string;
    platform: string;
    name: string;
    handle: string | null;
    credentials: unknown;
    config: unknown;
  },
  channel: { externalId: string; platform: string } | null
) {
  if (!channel) return account;
  const credentials = isRecord(account.credentials) ? { ...account.credentials } : {};
  const config = isRecord(account.config) ? { ...account.config } : {};
  if (account.platform === "telegram") {
    credentials.target = channel.externalId;
  }
  if (account.platform === "zalo-personal") {
    config.threadId = channel.externalId;
  }
  return { ...account, credentials, config };
}

export async function processPublish(rawJob: unknown, context: ProcessorContext) {
  const job = publishExecuteJobSchema.parse(rawJob) satisfies PublishExecuteJob;
  const startedAt = new Date();
  const log = await context.prisma.workerJobLog.create({
    data: {
      queueName: "publish",
      jobName: "publish.execute",
      status: "running",
      payload: job,
      startedAt
    }
  });

  const attemptNo = (await context.prisma.publishAttempt.count({
    where: { contentId: job.contentId, targetId: job.targetId, ...(job.targetChannelId ? { targetChannelId: job.targetChannelId } : {}) }
  })) + 1;
  const attempt = await context.prisma.publishAttempt.create({
    data: {
      contentId: job.contentId,
      targetId: job.targetId,
      ...(job.targetChannelId ? { targetChannelId: job.targetChannelId } : {}),
      attemptNo,
      status: "running",
      startedAt
    }
  });

  let targetPlatform: string | undefined;

  try {
    const content = await context.prisma.content.findUniqueOrThrow({
      where: { id: job.contentId },
      include: { media: true, source: { include: { routingRules: true } } }
    });
    if (content.status === "paused") {
      await context.prisma.publishAttempt.update({ where: { id: attempt.id }, data: { status: "cancelled", error: "Bài đăng đang bị tạm dừng", completedAt: new Date() } });
      await context.prisma.workerJobLog.update({ where: { id: log.id }, data: { status: "completed", completedAt: new Date() } });
      return;
    }
    const target = await context.prisma.targetAccount.findUniqueOrThrow({ where: { id: job.targetId } });
    const targetChannel = job.targetChannelId
      ? await context.prisma.platformChannel.findUniqueOrThrow({ where: { id: job.targetChannelId } })
      : null;
    const linkedSource = target.linkedSourceAccountId
      ? await context.prisma.sourceAccount.findUniqueOrThrow({ where: { id: target.linkedSourceAccountId } })
      : null;
    const publishAccount = linkedSource
      ? {
          ...target,
          credentials: linkedSource.credentials,
          config: linkedSource.config,
          handle: linkedSource.handle,
          platform: linkedSource.platform
        }
      : target;
    targetPlatform = target.platform;
    if (!target.isActive || target.health === "paused") throw new Error("Target đang tắt hoặc bị pause");

    await context.prisma.content.update({ where: { id: content.id }, data: { status: "publishing" } });

    // The target platform determines which registered publish adapter handles this job.
    // The adapter registry resolves the correct adapter for each platform automatically.
    const metadata = (content.metadata ?? {}) as Record<string, unknown>;
    const postType = typeof metadata.type === "string" ? metadata.type : undefined;
    const threadsOptions = target.platform === "threads" ? normalizeThreadsPublishOptions(metadata.threads) : undefined;
    // M3-A4: caption template theo nền tảng (X ngắn, FB/Telegram dài) — giữ link affiliate.
    const platformCaption = formatCaptionForPlatform(
      content.finalText ?? content.draftText ?? content.originalText,
      target.platform
    );
    const preparedPublish = prepareThreadsPublishText(
      platformCaption,
      typeof metadata.comment === "string" ? metadata.comment : "",
      threadsOptions
    );
    const storedMedia = mapMediaAssets(content.media);
    const mediaSource = storedMedia.length > 0 ? storedMedia : normalizeMediaPaths(metadata.mediaPaths);
    const media = await ensureLocalMediaAssets(mediaSource.map((asset) => ({
      ...asset,
      metadata: {
        ...(asset.metadata ?? {}),
        ...(postType ? { postType, type: postType } : {})
      }
    })), { contentId: content.id });

    const adapter = context.registry.getPublish(target.platform as never);
    const result = await adapter.publish({
      account: toAdapterAccount(applyTargetChannelDestination(publishAccount, targetChannel)),
      contentId: content.id,
      text: preparedPublish.text,
      media,
      options: threadsOptions ? { threads: threadsOptions } : undefined
    });

    await context.prisma.publishAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "success",
        resultUrl: result.url,
        metadata: (result.metadata ?? {}) as any,
        completedAt: new Date()
      }
    });

    const targetIds = Array.isArray(content.scheduledTargets)
      ? (content.scheduledTargets as unknown[]).map(String)
      : content.source?.routingRules.filter((rule) => rule.isActive).map((rule) => rule.targetId) ?? [target.id];
    const successfulTargetCount = await context.prisma.publishAttempt.groupBy({
      by: [job.targetChannelId ? "targetChannelId" : "targetId"] as never,
      where: {
        contentId: content.id,
        ...(job.targetChannelId ? { targetChannelId: { in: targetIds } } : { targetId: { in: targetIds } }),
        status: "success"
      }
    } as never);
    const nextStatus = successfulTargetCount.length >= targetIds.length ? "published" : "publishing";

    await context.prisma.content.update({ where: { id: content.id }, data: { status: nextStatus } });
    await context.prisma.activityLog.create({
      data: {
        type: "publish:success",
        platform: target.platform,
        contentId: content.id,
        targetId: target.id,
        message: `Đã đăng ${content.code} lên ${targetChannel?.name ?? target.name}.`,
        metadata: { resultUrl: result.url, targetChannelId: targetChannel?.id ?? null }
      }
    });
    realtimeBus.emitEvent({
      type: "publish:success",
      contentId: content.id,
      targetId: target.id,
      platform: target.platform as never,
      resultUrl: result.url,
      createdAt: new Date().toISOString()
    });

    // Auto-enqueue first comment if defined in content metadata
    const commentText = preparedPublish.commentText.trim();
    if (commentText && result.url) {
      const commentMedia = Array.isArray(metadata.commentMedia) ? metadata.commentMedia : [];
      const commentDelayMs = typeof metadata.commentDelayMinutes === "number" ? metadata.commentDelayMinutes * 60 * 1000 : 60_000;
      const scheduledAt = new Date(Date.now() + commentDelayMs);

      const cq = await context.prisma.commentQueue.create({
        data: {
          contentId: content.id,
          targetId: target.id,
          commentText,
          commentMedia,
          scheduledAt,
          status: "pending"
        }
      });

      await context.enqueueComment({ version: 1, commentQueueId: cq.id }, commentDelayMs);
    }

    try {
      const tgSetting = await context.prisma.systemSetting.findUnique({ where: { key: "telegram_notify" } });
      const tg = (tgSetting?.value ?? {}) as Record<string, unknown>;
      if (tg.enabled && tg.botToken && tg.chatId) {
        const msg = `✅ Đã đăng bài
· Bài: ${content.code}
· Tài khoản: ${target.name}
· Nền tảng: ${target.platform}${result.url ? `
· Link: ${result.url}` : ""}`; // eslint-disable-line no-useless-concat
        await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage?chat_id=${tg.chatId}&text=${encodeURIComponent(msg)}`).catch(() => {});
      }
    } catch {}

    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "completed", completedAt: new Date() }
    });
  } catch (error) {
    const classified = classifyError(error);
    logger.error("Publish job lỗi", { contentId: job.contentId, targetId: job.targetId, error: classified.message, kind: classified.kind });

    if (classified instanceof AdapterAuthError || classified instanceof AdapterCheckpointError || classified.kind === "adapter_auth" || classified.kind === "adapter_checkpoint") {
      await context.prisma.targetAccount.update({ where: { id: job.targetId }, data: { health: "paused" } }).catch(() => undefined);
    }

    await context.prisma.publishAttempt.update({
      where: { id: attempt.id },
      data: { status: "failed", error: classified.message, completedAt: new Date() }
    });
    await context.prisma.content.update({ where: { id: job.contentId }, data: { status: "failed" } }).catch(() => undefined);
    await context.prisma.activityLog.create({
      data: {
        type: "publish:failed",
        contentId: job.contentId,
        targetId: job.targetId,
        message: `Đăng thất bại: ${classified.message}`
      }
    });
    realtimeBus.emitEvent({
      type: "publish:failed",
      contentId: job.contentId,
      targetId: job.targetId,
      platform: (targetPlatform ?? "telegram") as never,
      error: classified.message,
      createdAt: new Date().toISOString()
    });

    const needLogin =
      classified instanceof AdapterAuthError ||
      classified instanceof AdapterCheckpointError ||
      classified.kind === "adapter_auth" ||
      classified.kind === "adapter_checkpoint";
    await sendAlert(context.prisma, {
      category: needLogin ? "login_required" : "publish_fail",
      platform: targetPlatform ?? "unknown",
      account: job.targetId,
      detail: classified.message
    }).catch(() => undefined);

    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "failed", error: classified.message, completedAt: new Date() }
    });
    throw classified;
  }
}
