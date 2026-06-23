import {
  buildAiContext,
  classifyWithRetry,
  decideContent,
  evaluateRules,
  nextProcessedStatus,
  readSourceProfile,
  resolveRouting,
  sanitizeDealText,
  detectNetwork,
  expandUrl
} from "@zerun/core";
import { classifyError, logger, normalizeAffiliateCategories, realtimeBus, withRetry } from "@zerun/shared";
import { contentProcessJobSchema, type ContentProcessJob } from "../types.js";
import { loadAiProvider } from "../ai/provider-factory.js";
import { DEAL_ANALYSIS_SYSTEM_PROMPT } from "../ai/system-prompt.js";
import type { ProcessorContext } from "./context.js";
import { applyConvertedLinks, stripDropLinks } from "./helpers.js";
import { classifyConvertError, sendAlert } from "../notify/alert.js";

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
        links: true,
        media: true,
        source: {
          include: { routingRules: { include: { target: true } } }
        },
        sourceChannel: {
          include: {
            sourceFlowLinks: {
              include: {
                flow: {
                  include: {
                    targets: { include: { channel: true } }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (isTerminalOrQueuedStatus(content.status)) {
      await context.prisma.workerJobLog.update({ where: { id: log.id }, data: { status: "completed", completedAt: new Date() } });
      logger.debug("Bỏ qua content-process vì nội dung đã ở trạng thái cuối/đang chờ publish", {
        contentId: content.id,
        status: content.status
      });
      return;
    }

    await context.prisma.content.update({ where: { id: content.id }, data: { status: "processing" } });

    // ── Bước 1: Rule engine (pure, không I/O) ─────────────────────────────
    const sourceProfile = readSourceProfile(content.source?.config, content.sourceId ?? undefined);
    const hasImage = Array.isArray((content as unknown as Record<string, unknown>).media)
      ? ((content as unknown as Record<string, unknown>).media as unknown[]).length > 0
      : false;
    const sourceLinkRewriteMap = readStringMap(content.source?.config, "linkRewriteMap");
    const preparedText = sanitizeDealText(content.originalText ?? "", {
      linkRewriteMap: sourceLinkRewriteMap
    });

    const ruleResult = evaluateRules({
      text: preparedText,
      sourceProfile,
      hasImage
    });

    if (ruleResult.verdict === "skip" && !ruleResult.needAi) {
      await context.prisma.content.update({
        where: { id: content.id },
        data: { status: "skipped", metadata: { ...(content.metadata as Record<string, unknown>), rule: { verdict: "skip", reasons: ruleResult.reasons } } as any }
      });
      await context.prisma.workerJobLog.update({ where: { id: log.id }, data: { status: "completed", completedAt: new Date() } });
      logger.debug(`Content ${content.code} bị skip bởi rule: ${ruleResult.reasons.join("; ")}`);
      return;
    }

    // ── Bước 2: Routing resolution (cần trước AI để biết useAI) ─────────
    const allActiveTargetChannels = await context.prisma.platformChannel.findMany({
      where: { isTarget: true, isActive: true }
    });
    const activeFlowLinks = content.sourceChannel?.sourceFlowLinks.filter((link) => link.flow.isActive) ?? [];
    const sourceChannelHasNoActiveFlow = Boolean(content.sourceChannelId) && activeFlowLinks.length === 0;
    const channelRoutingRules = activeFlowLinks.flatMap((link) => {
      const flow = link.flow;
      const explicitTargets = flow.targets
        .map((targetLink) => targetLink.channel)
        .filter((channel) => channel.isActive && channel.isTarget);
      const targetChannels = explicitTargets.length > 0 ? explicitTargets : allActiveTargetChannels;
      return targetChannels.flatMap((channel) => {
        if (!channel.isActive || !channel.isTarget) return [];
        return [{
          targetId: channel.id,
          isActive: flow.isActive,
          autoPublish: flow.autoPublish,
          useAI: flow.useAI,
          requireReview: flow.requireReview,
          targetCategories: readJsonStringArray(channel.acceptedCategories),
          filterMode: channel.filterMode,
          allowGeneralContent: channel.allowGeneralContent,
          targetAccountId: channel.accountId
        }];
      });
    }) ?? [];
    const usesChannelRouting = channelRoutingRules.length > 0;
    const routingRules = usesChannelRouting ? channelRoutingRules : (content.source?.routingRules ?? []).map((rule) => ({
        targetId: rule.targetId,
        isActive: rule.isActive,
        autoPublish: rule.autoPublish,
        useAI: rule.useAI,
        requireReview: rule.requireReview,
        targetCategories: readTargetAcceptedCategories(rule.target?.config)
      }));
    let routing = resolveRouting(routingRules);

    // ── Bước 3: AI classify (nếu rule + routing yêu cầu) ─────────────────
    let aiMeta: Record<string, unknown> = {};
    let draftText = preparedText;
    let aiDecision: ReturnType<typeof decideContent> | null = null;

    const shouldUseAiReviewer = ruleResult.needAi && (routing.useAI || routing.requiresManualReview || ruleResult.verdict === "require_review");
    if (shouldUseAiReviewer) {
      const provider = await loadAiProvider(context.prisma);
      if (provider) {
        try {
          const aiCtx = buildAiContext({ text: preparedText, sourceProfile, hasImage });
          const result = await classifyWithRetry(provider, { context: aiCtx, systemPrompt: DEAL_ANALYSIS_SYSTEM_PROMPT });
          aiDecision = decideContent(ruleResult, result.analysis);
          aiMeta = {
            analysis: result.analysis,
            decision: aiDecision,
            usage: result.usage,
            model: provider.name
          };
          if (result.analysis.rewrittenText) {
            draftText = result.analysis.rewrittenText;
          }
          logger.debug(`AI phân tích ${content.code}`, {
            verdict: aiDecision.status,
            confidence: result.analysis.confidence,
            messageType: result.analysis.messageType
          });
        } catch (error) {
          logger.error("AI classify lỗi, tiếp tục không có AI", {
            contentId: content.id,
            error: (error as Error).message
          });
        }
      }
    }

    // Nếu AI quyết định skip → dừng sớm
    const analysisRouting = readAnalysisRoutingInput(aiMeta);
    if (analysisRouting.categories.length > 0) {
      routing = resolveRouting(routingRules, {
        analysisCategories: analysisRouting.categories,
        categoryConfidence: analysisRouting.categoryConfidence,
        isGeneralContent: isGeneralDealContent(aiMeta)
      });
    }

    if (aiDecision?.status === "skipped") {
      await context.prisma.content.update({
        where: { id: content.id },
        data: { status: "skipped", metadata: { ...(content.metadata as Record<string, unknown>), ai: aiMeta } as any }
      });
      await context.prisma.workerJobLog.update({ where: { id: log.id }, data: { status: "completed", completedAt: new Date() } });
      return;
    }

    // ── Bước 3: Convert affiliate links ──────────────────────────────────
    const draftForConversion = sanitizeDealText(draftText ?? preparedText, {
      linkRewriteMap: sourceLinkRewriteMap
    });
    const detectedLinks = context.registry.affiliateAdapter.detect(draftForConversion);
    const converted = [];
    let hasUnsupportedLinks = false;

    // Nếu AI đã phân tích, chỉ convert link mà analysis.links[].shouldConvert=true
    const aiLinks = aiMeta.analysis && typeof aiMeta.analysis === "object"
      ? (aiMeta.analysis as { links?: Array<{ url: string; shouldConvert?: boolean }> }).links ?? []
      : [];
    const shouldConvertSet = aiLinks.length > 0
      ? new Set(aiLinks.filter((l) => l.shouldConvert).map((l) => l.url))
      : null; // null = convert tất cả link hợp lệ

    for (const link of detectedLinks) {
      const resolvedUrl = await expandUrl(link.url, followRedirectUrl);
      const resolvedNetwork = detectNetwork(resolvedUrl);
      const shouldUseResolvedUrl = resolvedNetwork !== "unknown" && (link.network === "unknown" || resolvedNetwork === link.network);
      const conversionUrl = shouldUseResolvedUrl ? resolvedUrl : link.url;
      const conversionNetwork = shouldUseResolvedUrl ? resolvedNetwork : link.network;
      const isSupported = conversionNetwork !== "unknown";
      const existingConverted = content.links.find((item) => item.originalUrl === link.url && item.status === "converted" && item.convertedUrl);
      let convertedUrl: string | null = null;
      let status = "detected";
      let error: string | undefined;

      if (existingConverted?.convertedUrl) {
        convertedUrl = existingConverted.convertedUrl;
        status = "converted";
      } else if (!link.supported && !isSupported) {
        status = "unsupported";
      } else if (shouldConvertSet !== null && !shouldConvertSet.has(link.url)) {
        // AI quyết định không convert link này
        status = "skipped_by_ai";
      } else {
        try {
          const result = await withRetry(
            () =>
              context.registry.affiliateAdapter.convert({
                url: conversionUrl,
                network: conversionNetwork,
                campaignId: readCampaignId(content.source?.config)
              }),
            { label: `convert:${conversionNetwork}`, retries: 2 }
          );
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
        where: { contentId_originalUrl: { contentId: content.id, originalUrl: link.url } },
        update: { convertedUrl, network: conversionNetwork, status, position: link.position, error },
        create: { contentId: content.id, originalUrl: link.url, convertedUrl, network: conversionNetwork, status, position: link.position, error }
      });
      converted.push(saved);
    }

    // Alert convert thất bại (1 alert/content, có throttle để không spam)
    const failedLink = converted.find((l) => l.status === "failed");
    if (failedLink) {
      const message = failedLink.error ?? "convert thất bại";
      await sendAlert(context.prisma, {
        category: classifyConvertError(message),
        network: failedLink.network ?? undefined,
        detail: message,
        throttleKey: `convert:${content.id}`
      }).catch(() => undefined);
    }

    // ── Bước 4: Final text + status ──────────────────────────────────────
    // Gỡ link rác (group/tutorial/cashback) xác định từ rule engine
    const dropUrls = ruleResult.links.filter((l) => l.drop).map((l) => l.url);
    const cleanedDraft = sanitizeDealText(stripDropLinks(draftForConversion, dropUrls), {
      dropUrls,
      linkRewriteMap: sourceLinkRewriteMap
    });
    const finalText = applyConvertedLinks(cleanedDraft, converted);

    // Nếu AI ra quyết định → dùng nó, kết hợp với routing
    const routingHoldReason = sourceChannelHasNoActiveFlow
      ? "Kênh nguồn chưa được gắn vào luồng đăng lại đang bật"
      : routing.holdReason === "no_matching_target"
        ? "Không có kênh đích nào nhận ngành hàng này"
        : routing.targetIds.length === 0
          ? "Chưa có kênh đích nào đang bật"
          : null;

    let nextStatus: string;
    if (failedLink) {
      nextStatus = "waiting_manual_convert";
    } else if (aiDecision) {
      if (aiDecision.status === "ready_to_publish" && routing.targetIds.length > 0) {
        nextStatus = "ready_to_publish";
      } else if (aiDecision.status === "ready_to_publish") {
        nextStatus = "waiting_manual_convert";
      } else {
        nextStatus = "skipped";
      }
    } else {
      nextStatus = nextProcessedStatus({
        hasRoutingTargets: routing.targetIds.length > 0,
        requiresManualReview: routing.requiresManualReview,
        hasUnsupportedLinks,
        scheduledAt: content.scheduledAt
      });
    }

    // ── M2-D1: ghi lại "AI sẽ làm gì" + gate auto-publish (shadow / kill switch) ──
    const wouldPublishTargets =
      nextStatus === "ready_to_publish"
        ? aiDecision
          ? aiDecision.autoPublish
            ? routing.autoPublishTargetIds
            : []
          : routing.autoPublishTargetIds
        : [];
    const shadowMode = readShadowMode(content.source?.config);
    const autoPublishEnabled = await isAutoPublishEnabled(context.prisma);
    const held = wouldPublishTargets.length > 0 && (shadowMode || !autoPublishEnabled);
    const aiReview = {
      verdict: aiDecision?.status ?? null,
      autoPublish: aiDecision?.autoPublish ?? (aiDecision ? false : null),
      confidence: typeof (aiMeta.analysis as { confidence?: unknown } | undefined)?.confidence === "number"
        ? (aiMeta.analysis as { confidence: number }).confidence
        : null,
      wouldPublishTargets,
      held,
      heldReason: held ? (shadowMode ? "shadow" : "kill_switch") : null,
      primaryCategory: analysisRouting.primaryCategory,
      secondaryCategories: analysisRouting.secondaryCategories,
      categoryConfidence: analysisRouting.categoryConfidence,
      categoryReason: analysisRouting.categoryReason,
      matchedTargetIds: routing.matchedTargetIds,
      unmatchedTargetIds: routing.unmatchedTargetIds,
      routingHoldReason,
      recordedAt: new Date().toISOString()
    };

    await context.prisma.content.update({
      where: { id: content.id },
      data: {
        draftText: cleanedDraft,
        finalText,
        status: nextStatus as never,
        scheduledTargets: routing.targetIds,
        ...(routingHoldReason ? { savedReason: routingHoldReason, savedSource: "category_routing" } : {}),
        metadata: {
          ...(content.metadata as Record<string, unknown>),
          ai: aiMeta,
          review: aiReview,
          sanitizer: {
            preparedText,
            linkRewriteMap: sourceLinkRewriteMap
          }
        } as any
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
      status: nextStatus as never,
      createdAt: new Date().toISOString()
    });

    if (nextStatus === "ready_to_publish" && !held) {
      // With AI: auto-publish when AI says shouldPublish=true and routing has auto targets.
      // Without AI: trust routing rule directly (autoPublish + !requireReview)
      // Shadow mode / kill switch (held=true): giữ lại chờ duyệt, không đăng.
      await Promise.all(
        wouldPublishTargets.map((targetId) => {
          const channelRule = usesChannelRouting
            ? channelRoutingRules.find((rule) => rule.targetId === targetId)
            : null;
          return context.enqueuePublish({
            version: 1,
            contentId: content.id,
            targetId: channelRule?.targetAccountId ?? targetId,
            ...(channelRule ? { targetChannelId: targetId } : {}),
            requestedBy: "system"
          });
        })
      );
    } else if (held) {
      logger.info(`Auto-publish bị giữ (${aiReview.heldReason}) cho ${content.code}`, {
        wouldPublishTargets
      });
    }

    await context.prisma.workerJobLog.update({ where: { id: log.id }, data: { status: "completed", completedAt: new Date() } });
  } catch (error) {
    const classified = classifyError(error);
    logger.error("Content process job lỗi", { contentId: job.contentId, error: classified.message, kind: classified.kind });
    await context.prisma.workerJobLog.update({ where: { id: log.id }, data: { status: "failed", error: classified.message, completedAt: new Date() } });
    throw classified;
  }
}

function readTargetAcceptedCategories(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  return normalizeAffiliateCategories((config as Record<string, unknown>).acceptedCategories);
}

function isTerminalOrQueuedStatus(status: string) {
  return [
    "published",
    "publishing",
    "ready_to_publish",
    "scheduled",
    "paused",
    "duplicate",
    "skipped",
    "rejected"
  ].includes(status);
}

function readJsonStringArray(value: unknown) {
  return normalizeAffiliateCategories(value);
}

function isGeneralDealContent(aiMeta: Record<string, unknown>) {
  const analysis = aiMeta.analysis && typeof aiMeta.analysis === "object" && !Array.isArray(aiMeta.analysis)
    ? aiMeta.analysis as Record<string, unknown>
    : {};
  const messageType = typeof analysis.messageType === "string" ? analysis.messageType.toLowerCase() : "";
  const primaryCategory = typeof analysis.primaryCategory === "string" ? analysis.primaryCategory.toLowerCase() : "";
  const reasonText = [
    analysis.categoryReason,
    analysis.summary,
    analysis.rewrittenText
  ].filter((item): item is string => typeof item === "string").join(" ").toLowerCase();
  return [
    "voucher_code",
    "campaign_list",
    "general_voucher",
    "sitewide_deal"
  ].includes(messageType) ||
    primaryCategory === "general" ||
    /toàn sàn|toan san|shopee vip|deal 1k|deal 9k|voucher chung|mã chung|ma chung/.test(reasonText);
}

function readAnalysisRoutingInput(aiMeta: Record<string, unknown>) {
  const analysis = aiMeta.analysis && typeof aiMeta.analysis === "object"
    ? aiMeta.analysis as Record<string, unknown>
    : {};
  const primaryCategory = typeof analysis.primaryCategory === "string" ? analysis.primaryCategory : null;
  const secondaryCategories = normalizeAffiliateCategories(analysis.secondaryCategories);
  const categories = normalizeAffiliateCategories([
    ...(primaryCategory ? [primaryCategory] : []),
    ...secondaryCategories
  ]);
  const categoryConfidence = typeof analysis.categoryConfidence === "number" ? analysis.categoryConfidence : null;
  const categoryReason = typeof analysis.categoryReason === "string" ? analysis.categoryReason : null;
  return {
    primaryCategory,
    secondaryCategories,
    categories,
    categoryConfidence,
    categoryReason
  };
}

function readCampaignId(config: unknown): string | undefined {
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  const value = (config as Record<string, unknown>).campaignId;
  return typeof value === "string" ? value : undefined;
}

function readStringMap(config: unknown, key: string): Record<string, string> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const value = (config as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([from, to]) => [from.trim(), to.trim()])
      .filter(([from, to]) => from.length > 0 && to.length > 0)
  );
}

/** Source bật shadow mode → AI quyết nhưng giữ lại chờ duyệt. */
function readShadowMode(config: unknown): boolean {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  return (config as Record<string, unknown>).shadowMode === true;
}

/** Kill switch toàn hệ thống (SystemSetting `auto_publish_enabled`, mặc định bật). */
async function isAutoPublishEnabled(prisma: ProcessorContext["prisma"]): Promise<boolean> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "auto_publish_enabled" } });
    if (!setting) return true;
    const value = setting.value as Record<string, unknown> | boolean | null;
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object" && "enabled" in value) return Boolean((value as Record<string, unknown>).enabled);
    return true;
  } catch {
    return true;
  }
}

async function followRedirectUrl(url: string): Promise<string> {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", headers, signal: controller.signal });
    return head.url || url;
  } catch {
    const getController = new AbortController();
    const getTimeout = setTimeout(() => getController.abort(), 10_000);
    try {
      const get = await fetch(url, { method: "GET", redirect: "follow", headers, signal: getController.signal });
      await get.body?.cancel().catch(() => undefined);
      return get.url || url;
    } finally {
      clearTimeout(getTimeout);
    }
  } finally {
    clearTimeout(timeout);
  }
}
