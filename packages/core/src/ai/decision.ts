import type { ContentStatus } from "@zerun/shared";
import type { DealAnalysis } from "./schemas.js";
import type { RuleResult } from "../rules/rule-engine.js";

export const AUTO_PUBLISH_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.65;

export type ContentDecision = {
  status: Extract<ContentStatus, "ready_to_publish" | "waiting_manual_convert" | "skipped">;
  autoPublish: boolean;
  reason: string;
};

/** Kết hợp rule an toàn với quyết định true/false của AI. */
export function decideContent(rule: RuleResult, analysis: DealAnalysis): ContentDecision {
  if (!analysis.shouldSave || analysis.messageType === "spam") {
    return { status: "skipped", autoPublish: false, reason: analysis.reason || "AI xác định không phải deal nên đã bỏ qua." };
  }

  if (analysis.shouldPublish) {
    return {
      status: "ready_to_publish",
      autoPublish: true,
      reason: analysis.requireReview || rule.verdict === "require_review"
        ? `AI đã duyệt thay bước thủ công: ${analysis.reason || rule.reasons.join("; ")}`
        : "Đủ điều kiện auto publish."
    };
  }

  return { status: "skipped", autoPublish: false, reason: analysis.reason || "AI xác định không phải deal nên đã bỏ qua." };
}
