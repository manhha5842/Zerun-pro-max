import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decideContent, resolveRouting } from "../packages/core/src/index.js";
import type { DealAnalysis } from "../packages/core/src/index.js";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const baseAnalysis: DealAnalysis = {
  shouldSave: true,
  shouldPublish: true,
  requireReview: false,
  messageType: "product_deal",
  primaryCategory: "beauty",
  secondaryCategories: [],
  categoryConfidence: 0.21,
  categoryReason: "AI đã chọn ngành làm đẹp.",
  platform: "shopee",
  shortTitle: "Deal serum dưỡng da",
  discount: "50%",
  links: [],
  imageDecision: { shouldKeepImage: true, needVisionCheck: false },
  rewrittenText: "Serum dưỡng da đang giảm sâu https://s.shopee.vn/abc",
  reason: "Tin có link Shopee và nội dung deal rõ.",
  confidence: 0.2
};

describe("simplified repost pipeline", () => {
  it("routes to receive-all targets even when category confidence is low", () => {
    const routing = resolveRouting(
      [
        {
          targetId: "target-all",
          isActive: true,
          autoPublish: true,
          requireReview: false,
          useAI: true,
          filterMode: "all"
        },
        {
          targetId: "target-beauty",
          isActive: true,
          autoPublish: true,
          requireReview: false,
          useAI: true,
          filterMode: "category",
          targetCategories: ["beauty"]
        }
      ],
      {
        analysisCategories: ["beauty"],
        categoryConfidence: 0.1
      }
    );

    expect(routing.targetIds).toEqual(["target-all", "target-beauty"]);
    expect(routing.autoPublishTargetIds).toEqual(["target-all", "target-beauty"]);
    expect(routing.requiresManualReview).toBe(false);
    expect(routing.holdReason).toBeUndefined();
  });

  it("keeps content ready when AI says shouldPublish true even with low confidence", () => {
    const decision = decideContent(
      {
        verdict: "proceed",
        reasons: [],
        safe: true,
        needAi: true,
        links: []
      },
      baseAnalysis
    );

    expect(decision.status).toBe("ready_to_publish");
    expect(decision.autoPublish).toBe(true);
    expect(decision.reason).not.toMatch(/confidence|tin cậy/i);
  });

  it("lets AI approve content that old rules would send to manual review", () => {
    const decision = decideContent(
      {
        verdict: "require_review",
        reasons: ["Trộn nhiều sàn - trước đây cần duyệt thủ công."],
        safe: false,
        needAi: true,
        links: []
      },
      {
        ...baseAnalysis,
        requireReview: true,
        shouldPublish: true,
        reason: "AI đã duyệt nội dung này có thể đăng."
      }
    );

    expect(decision.status).toBe("ready_to_publish");
    expect(decision.autoPublish).toBe(true);
    expect(decision.reason).toContain("AI");
  });

  it("does not block matched targets just because a flow was configured as manual review", () => {
    const routing = resolveRouting([
      {
        targetId: "target-ai-review",
        isActive: true,
        autoPublish: false,
        requireReview: true,
        useAI: true,
        filterMode: "all"
      }
    ]);

    expect(routing.targetIds).toEqual(["target-ai-review"]);
    expect(routing.autoPublishTargetIds).toEqual(["target-ai-review"]);
    expect(routing.requiresManualReview).toBe(false);
  });

  it("flow UI presents a compact pipeline instead of rule-engine controls", () => {
    const flowPage = read("apps/web-admin/src/pages/RepostFlowPage.tsx");

    expect(flowPage).toContain("Tin từ");
    expect(flowPage).toContain("Nguồn → Gom tin → AI → Đổi link → Route → Đăng");
    expect(flowPage).toContain("Lịch sử lấy nguồn tin");
    expect(flowPage).toContain("Kênh đích của flow");
    expect(flowPage).toContain("Flow này đăng vào");
    expect(flowPage).not.toContain("targetScope");
    expect(flowPage).not.toContain("Dùng tất cả kênh đích active");
    expect(flowPage).not.toContain("Phạm vi đăng");
    expect(flowPage).not.toContain("Flow này đang dùng tất cả kênh đích active.");
    expect(flowPage).not.toContain("Flow này chỉ dùng");
    expect(flowPage).toContain("Chạy thử flow");
    expect(flowPage).toContain("Gom gói");
    expect(flowPage).toContain("Final action");
    expect(flowPage).not.toContain("sourceSummary.polling");
    expect(flowPage).not.toContain("NODE_CONFIG_STORAGE_KEY");
    expect(flowPage).not.toContain("Bật lọc trùng");
    expect(flowPage).not.toContain("Cần keyword deal");
    expect(flowPage).not.toContain("Ngưỡng tin cậy");
    expect(flowPage).not.toContain("Bật convert affiliate");
    expect(flowPage).not.toContain("Theo dõi realtime");
    expect(flowPage).not.toContain("Cho phép ảnh/video");
  });

  it("review queue copy only describes actionable work", () => {
    const queuePage = read("apps/web-admin/src/pages/RepostReviewQueuePage.tsx");

    expect(queuePage).toContain("Content package");
    expect(queuePage).toContain("tin đã gom");
    expect(queuePage).toContain("Gom tin:");
    expect(queuePage).toContain("Duyệt theo content package");
    expect(queuePage).toContain("Cần xử lý");
    expect(queuePage).toContain("Link lỗi");
    expect(queuePage).toContain("Chọn kênh đích");
    expect(queuePage).toContain("Không có kênh đích active");
    expect(queuePage).toContain("Không có kênh nhận ngành này");
    expect(queuePage).toContain("Nguồn chưa gắn flow");
    expect(queuePage).toContain("Xem chi tiết");
    expect(queuePage).toContain("ReviewPackageDetails");
    expect(queuePage).toContain("Cần convert link trước khi đăng");
    expect(queuePage).not.toContain("Publish now");
    expect(queuePage).not.toContain("<Badge tone=\"warn\">Cần chọn đích</Badge>");
    expect(queuePage).not.toContain("confidence thấp");
    expect(queuePage).not.toContain("không match target");
  });

  it("source crawl creates content packages before processing", () => {
    const crawler = read("packages/worker-core/src/processors/source-crawl.ts");
    const realtime = read("packages/worker-core/src/processors/realtime-listener.ts");

    expect(crawler).toContain("groupRawMessagesIntoPackages");
    expect(crawler).toContain("toRawMessageForGrouping");
    expect(crawler).toContain("contentPackage");
    expect(crawler).toContain("rawMessageIds");
    expect(crawler).toContain("groupingReason");
    expect(realtime).toContain("REALTIME_BUFFER_WINDOW_MS");
    expect(realtime).toContain("bufferRealtimeItem");
    expect(realtime).toContain("flushRealtimeBuffer");
    expect(realtime).toContain("groupRawMessagesIntoPackages");

    const apiApp = read("apps/api/src/app.ts");
    expect(apiApp).toContain("isRealtimeSourcePlatform");
    expect(apiApp).toContain("không tạo job polling");
  });

  it("manual publish maps target channel ids to target account ids before enqueueing", () => {
    const apiApp = read("apps/api/src/app.ts");

    expect(apiApp).toContain("resolvePublishJobs");
    expect(apiApp).toContain("targetChannelId: channel.id");
    expect(apiApp).toContain("targetId: channel.accountId");
    expect(apiApp).toContain("app.workerCore.publishNow(content.id, job.targetId, \"admin\", job.targetChannelId)");
    expect(apiApp).not.toContain("targetIds.map((targetId) => app.workerCore.publishNow(content.id, targetId, \"admin\"))");
    const publishProcessor = read("packages/worker-core/src/processors/publish.ts");
    expect(publishProcessor).toContain("normalizePublishJobTarget");
    expect(publishProcessor).toContain("targetChannelId: channel.id");
    expect(publishProcessor).toContain("targetId: channel.accountId");
    expect(apiApp).toContain("LINK_NOT_CONVERTED");
    expect(apiApp).toContain("processContent(content.id)");
    expect(publishProcessor).toContain("findUnconvertedPublishLinks");
    expect(publishProcessor).toContain("existingActiveAttempt");
    expect(publishProcessor).toContain("duplicateSuccess");
    const workerRuntime = read("packages/worker-core/src/runtime.ts");
    expect(workerRuntime).toContain("Shopee extension convert: gửi yêu cầu");
    expect(workerRuntime).toContain("Shopee extension convert: thất bại");
  });

  it("records a source-flow problem instead of blaming targets when a channel is not linked to a flow", () => {
    const processor = read("packages/worker-core/src/processors/content-process.ts");

    expect(processor).toContain("Kênh nguồn chưa được gắn vào luồng đăng lại đang bật");
    expect(processor).toContain("sourceChannelHasNoActiveFlow");
  });

  it("zalo publish does not silently drop media urls", () => {
    const zalo = read("packages/adapters/src/platforms/zalo-personal.ts");

    expect(zalo).toContain("downloadZaloAttachment");
    expect(zalo).toContain("Cookie");
    expect(zalo).toContain("User-Agent");
    expect(zalo).toContain("Không tải được ảnh/video Zalo để gửi kèm.");
    expect(zalo).not.toContain("media chỉ có URL");
  });
  it("zalo publish provides image metadata for local attachments", () => {
    const zalo = read("packages/adapters/src/platforms/zalo-personal.ts");
    const qrLogin = read("packages/adapters/src/session/zalo-qr-login.ts");
    const client = read("packages/adapters/src/session/zalo-client.ts");

    expect(zalo).toContain("createZaloClient");
    expect(qrLogin).toContain("createZaloClient");
    expect(client).toContain("imageMetadataGetter");
    expect(client).toContain("new Zalo({ imageMetadataGetter })");
  });

  it("telegram publish rejects invalid local media before uploading", () => {
    const telegram = read("packages/adapters/src/platforms/telegram.ts");

    expect(telegram).toContain("resolveTelegramPublishFiles");
    expect(telegram).toContain("Telegram media file is empty");
    expect(telegram).toContain("Telegram media file is not accessible");
    expect(telegram).toContain("input.media.length > 0 && files.length === 0");
  });
});
