import type { ContentStatus } from "@zerun/shared";
import type { DealAnalysis } from "./schemas.js";
import type { RuleResult } from "../rules/rule-engine.js";

export const AUTO_PUBLISH_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.65;

export type ContentDecision = {
  status: Extract<ContentStatus, "ready_to_publish" | "waiting_manual_convert" | "skipped"> | "review";
  autoPublish: boolean;
  reason: string;
};

/**
 * Kết hợp rule "safe" + AI confidence → quyết định trạng thái content.
 * Ngưỡng theo tài liệu: >=0.85 safe → auto; 0.65–0.84 → review; <0.65 → skip/review.
 */
export function decideContent(rule: RuleResult, analysis: DealAnalysis): ContentDecision {
  if (!analysis.shouldSave || analysis.messageType === "spam") {
    return { status: "skipped", autoPublish: false, reason: analysis.reason || "AI: bỏ qua." };
  }

  if (analysis.requireReview || rule.verdict === "require_review") {
    return { status: "review", autoPublish: false, reason: rule.reasons.join("; ") || analysis.reason };
  }

  if (analysis.shouldPublish && analysis.confidence >= REVIEW_THRESHOLD) {
    return {
      status: "ready_to_publish",
      autoPublish: rule.safe,
      reason: rule.safe ? "Đủ điều kiện auto publish." : "Nội dung hợp lệ sau khi chuẩn hoá."
    };
  }

  return { status: "review", autoPublish: false, reason: "Confidence thấp hoặc nội dung chưa đủ rõ." };
}
