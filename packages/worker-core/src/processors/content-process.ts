import { nextProcessedStatus, resolveRouting } from "@zerun/core";
import { classifyError, logger, realtimeBus } from "@zerun/shared";
import { contentProcessJobSchema, type ContentProcessJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { applyConvertedLinks } from "./helpers.js";

export async function processContent(rawJob: unknown, context: ProcessorContext) {
  const job = contentProcessJobSchema.parse(rawJob) satisfies ContentProcessJob;
  const startedAt = new Date();
  const log = await context.prisma.workerJobLog.create({
    data: {
      queueName: "content-process",
      jobName: "content.process",
      status: "running",
      payload: job,
      startedAt
    }
  });

  try {
    const content = await context.prisma.content.findUniqueOrThrow({
      where: { id: job.contentId },
      include: {
        source: {
          include: { routingRules: true }
        }
      }
    });

    await context.prisma.content.update({ where: { id: content.id }, data: { status: "processing" } });

    const detectedLinks = context.registry.affiliateAdapter.detect(content.originalText);
    const converted = [];
    let hasUnsupportedLinks = false;

    for (const link of detectedLinks) {
      let convertedUrl: string | null = null;
      let status = "detected";
      let error: string | undefined;

      if (!link.supported) {
        hasUnsupportedLinks = true;
        status = "unsupported";
      } else {
        try {
          const result = await context.registry.affiliateAdapter.convert({
            url: link.url,
            network: link.network,
            campaignId: readCampaignId(content.source?.config),
            subId: content.code
          });
          convertedUrl = result.converted;
          status = result.success ? "converted" : "failed";
          error = result.error;
          if (!result.success) hasUnsupportedLinks = true;
        } catch (conversionError) {
          const classified = classifyError(conversionError);
          status = "failed";
          error = classified.message;
          hasUnsupportedLinks = true;
        }
      }

      const saved = await context.prisma.contentLink.upsert({
        where: {
          contentId_originalUrl: {
            contentId: content.id,
            originalUrl: link.url
          }
        },
        update: {
          convertedUrl,
          network: link.network,
          status,
          position: link.position,
          error
        },
        create: {
          contentId: content.id,
          originalUrl: link.url,
          convertedUrl,
          network: link.network,
          status,
          position: link.position,
          error
        }
      });
      converted.push(saved);
    }

    const routing = resolveRouting(
      (content.source?.routingRules ?? []).map((rule) => ({
        targetId: rule.targetId,
        isActive: rule.isActive,
        autoPublish: rule.autoPublish,
        useAI: rule.useAI,
        requireReview: rule.requireReview
      }))
    );

    const finalText = applyConvertedLinks(content.draftText ?? content.originalText, converted);
    const nextStatus = nextProcessedStatus({
      hasRoutingTargets: routing.targetIds.length > 0,
      requiresManualReview: routing.requiresManualReview,
      hasUnsupportedLinks,
      scheduledAt: content.scheduledAt
    });

    await context.prisma.content.update({
      where: { id: content.id },
      data: {
        finalText,
        status: nextStatus,
        scheduledTargets: routing.targetIds
      }
    });

    await context.prisma.activityLog.create({
      data: {
        type: "content:status",
        platform: content.platform,
        contentId: content.id,
        sourceId: content.sourceId,
        message: `Nội dung ${content.code} chuyển sang trạng thái ${nextStatus}.`
      }
    });

    realtimeBus.emitEvent({
      type: "content:status",
      contentId: content.id,
      code: content.code,
      status: nextStatus,
      createdAt: new Date().toISOString()
    });

    if (nextStatus === "ready_to_publish") {
      await Promise.all(
        routing.autoPublishTargetIds.map((targetId) =>
          context.enqueuePublish({
            version: 1,
            contentId: content.id,
            targetId,
            requestedBy: "system"
          })
        )
      );
    }

    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "completed", completedAt: new Date() }
    });
  } catch (error) {
    const classified = classifyError(error);
    logger.error("Content process job lỗi", { contentId: job.contentId, error: classified.message, kind: classified.kind });
    await context.prisma.workerJobLog.update({
      where: { id: log.id },
      data: { status: "failed", error: classified.message, completedAt: new Date() }
    });
    throw classified;
  }
}

function readCampaignId(config: unknown): string | undefined {
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  const value = (config as Record<string, unknown>).campaignId;
  return typeof value === "string" ? value : undefined;
}
