import { AdapterAuthError, AdapterCheckpointError, classifyError, logger, realtimeBus } from "@zerun/shared";
import { publishExecuteJobSchema, type PublishExecuteJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { mapMediaAssets, toAdapterAccount } from "./helpers.js";

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

  const attemptNo = (await context.prisma.publishAttempt.count({ where: { contentId: job.contentId, targetId: job.targetId } })) + 1;
  const attempt = await context.prisma.publishAttempt.create({
    data: {
      contentId: job.contentId,
      targetId: job.targetId,
      attemptNo,
      status: "running",
      startedAt
    }
  });

  try {
    const content = await context.prisma.content.findUniqueOrThrow({
      where: { id: job.contentId },
      include: { media: true, source: { include: { routingRules: true } } }
    });
    const target = await context.prisma.targetAccount.findUniqueOrThrow({ where: { id: job.targetId } });
    if (!target.isActive || target.health === "paused") throw new Error("Target đang tắt hoặc bị pause");

    await context.prisma.content.update({ where: { id: content.id }, data: { status: "publishing" } });

    const adapter = context.registry.getPublish(target.platform as never);
    const result = await adapter.publish({
      account: toAdapterAccount(target),
      contentId: content.id,
      text: content.finalText ?? content.draftText ?? content.originalText,
      media: mapMediaAssets(content.media)
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

    const targetIds = content.source?.routingRules.filter((rule) => rule.isActive).map((rule) => rule.targetId) ?? [target.id];
    const successfulTargetCount = await context.prisma.publishAttempt.groupBy({
      by: ["targetId"],
      where: {
        contentId: content.id,
        targetId: { in: targetIds },
        status: "success"
      }
    });
    const nextStatus = successfulTargetCount.length >= targetIds.length ? "published" : "publishing";

    await context.prisma.content.update({ where: { id: content.id }, data: { status: nextStatus } });
    await context.prisma.activityLog.create({
      data: {
        type: "publish:success",
        platform: target.platform,
        contentId: content.id,
        targetId: target.id,
        message: `Đã đăng ${content.code} lên ${target.name}.`,
        metadata: { resultUrl: result.url }
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
      platform: "telegram",
      error: classified.message,
      createdAt: new Date().toISOString()
    });
    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "failed", error: classified.message, completedAt: new Date() }
    });
    throw classified;
  }
}
