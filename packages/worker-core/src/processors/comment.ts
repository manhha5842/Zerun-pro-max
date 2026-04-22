import { AdapterAuthError, AdapterCheckpointError, classifyError, logger, realtimeBus } from "@zerun/shared";
import { commentExecuteJobSchema, type CommentExecuteJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { toAdapterAccount } from "./helpers.js";

export async function processComment(rawJob: unknown, context: ProcessorContext) {
  const job = commentExecuteJobSchema.parse(rawJob) satisfies CommentExecuteJob;
  const startedAt = new Date();

  const queueItem = await context.prisma.commentQueue.findUnique({
    where: { id: job.commentQueueId },
    include: { content: true, target: true }
  });
  if (!queueItem) throw new Error("CommentQueue item not found");
  if (queueItem.status === "cancelled" || queueItem.status === "done") return;

  await context.prisma.commentQueue.update({
    where: { id: queueItem.id },
    data: { status: "running", error: null, updatedAt: startedAt }
  });

  try {
    const target = queueItem.target;
    if (!target.isActive || target.health === "paused") throw new Error("Target đang tắt hoặc bị pause");

    const latestSuccess = await context.prisma.publishAttempt.findFirst({
      where: { contentId: queueItem.contentId, targetId: queueItem.targetId, status: "success" },
      orderBy: { createdAt: "desc" }
    });
    const postUrl = latestSuccess?.resultUrl;
    if (!postUrl) throw new Error("Không tìm thấy link bài viết để comment");

    const adapter = context.registry.getPublish(target.platform as never);
    if (!adapter.comment) throw new Error(`Nền tảng ${target.platform} chưa hỗ trợ comment automation`);

    const result = await adapter.comment({
      account: toAdapterAccount(target),
      postUrl,
      text: queueItem.commentText,
      media: Array.isArray(queueItem.commentMedia) ? (queueItem.commentMedia as any[]) : []
    });

    await context.prisma.commentQueue.update({
      where: { id: queueItem.id },
      data: {
        status: "done",
        resultUrl: result.url ?? postUrl,
        error: null,
        updatedAt: new Date()
      }
    });

    await context.prisma.activityLog.create({
      data: {
        type: "comment:success",
        platform: target.platform,
        contentId: queueItem.contentId,
        targetId: queueItem.targetId,
        message: `Đã comment cho ${queueItem.content.code} trên ${target.name}.`,
        metadata: { resultUrl: result.url ?? postUrl }
      }
    });

    realtimeBus.emitEvent({
      type: "publish:success",
      contentId: queueItem.contentId,
      targetId: queueItem.targetId,
      platform: target.platform as never,
      resultUrl: result.url ?? postUrl,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    const classified = classifyError(error);
    logger.error("Comment job lỗi", { commentQueueId: job.commentQueueId, error: classified.message, kind: classified.kind });

    if (classified instanceof AdapterAuthError || classified instanceof AdapterCheckpointError || classified.kind === "adapter_auth" || classified.kind === "adapter_checkpoint") {
      await context.prisma.targetAccount.update({ where: { id: queueItem.targetId }, data: { health: "paused" } }).catch(() => undefined);
    }

    await context.prisma.commentQueue.update({
      where: { id: queueItem.id },
      data: {
        status: "failed",
        error: classified.message,
        attemptNo: { increment: 1 },
        updatedAt: new Date()
      }
    });

    await context.prisma.activityLog.create({
      data: {
        type: "comment:failed",
        contentId: queueItem.contentId,
        targetId: queueItem.targetId,
        message: `Comment thất bại: ${classified.message}`
      }
    });

    throw classified;
  }
}
