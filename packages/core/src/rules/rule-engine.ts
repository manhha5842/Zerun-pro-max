import { detectLinks, detectLinkRole, detectNetwork, type LinkRole } from "../links/detect.js";
import type { SourceProfile } from "./source-profile.js";

export type RuleVerdict = "skip" | "require_review" | "proceed";

export type RuleLink = {
  url: string;
  role: LinkRole;
  /** Affiliate-supported network (shopee/lazada/...) và là product/campaign link. */
  convertible: boolean;
  /** Link rác cần gỡ khỏi caption trước khi publish (group/tutorial/cashback...). */
  drop: boolean;
};

export type RuleResult = {
  verdict: RuleVerdict;
  /** Có nên gọi AI không. Tin spam/comment rõ ràng thì bỏ qua AI để tiết kiệm token. */
  needAi: boolean;
  links: RuleLink[];
  reasons: string[];
  /** "safe" = đủ điều kiện auto publish nếu source cho phép và rule nội bộ không chặn. */
  safe: boolean;
};

export type RuleInput = {
  text: string;
  sourceProfile: SourceProfile;
  isReply?: boolean;
  hasImage?: boolean;
  /** Caption mơ hồ (có ảnh nhưng text quá ngắn) — do caller xác định hoặc auto. */
  ambiguousCaption?: boolean;
};

const DROP_ROLES: ReadonlySet<LinkRole> = new Set([
  "group_link",
  "tutorial_link",
  "cashback_link",
  "form_link",
  "review_link"
]);

const MIN_MEANINGFUL_LENGTH = 12;

/**
 * Rule engine — xử lý các quyết định chắc chắn bằng code, trước khi đụng AI.
 * Pure function, không I/O.
 */
export function evaluateRules(input: RuleInput): RuleResult {
  const { text, sourceProfile } = input;
  const reasons: string[] = [];

  const links: RuleLink[] = detectLinks(text).map((link) => {
    const role = detectLinkRole(link.url);
    return {
      url: link.url,
      role,
      convertible: link.supported && (role === "product_link" || role === "campaign_link"),
      drop: DROP_ROLES.has(role)
    };
  });

  const convertible = links.filter((l) => l.convertible);
  const cleaned = text.trim();

  // --- Skip rules (chắc chắn bỏ, không cần AI) ---
  if (cleaned.length < MIN_MEANINGFUL_LENGTH && !input.hasImage) {
    reasons.push("Tin quá ngắn, không có ảnh — coi như comment/rác.");
    return { verdict: "skip", needAi: false, links, reasons, safe: false };
  }

  // --- Require review rules ---
  let verdict: RuleVerdict = "proceed";
  const requireReview = (reason: string) => {
    verdict = "require_review";
    reasons.push(reason);
  };

  const networks = new Set(convertible.map((l) => detectNetwork(l.url)).filter((n) => n !== "unknown"));
  if (networks.size > 1) requireReview("Trộn nhiều sàn - AI cần kiểm tra kỹ.");
  if (input.isReply) requireReview("Tin là reply/comment.");
  if (input.ambiguousCaption) {
    requireReview("Có ảnh nhưng caption mơ hồ.");
  }
  if (sourceProfile.trustLevel === "low") requireReview("Source trust thấp/mới.");

  const safe =
    verdict === "proceed" &&
    convertible.length <= 3 &&
    !input.isReply &&
    sourceProfile.trustLevel === "high" &&
    sourceProfile.allowAutoPublish;

  return { verdict, needAi: true, links, reasons, safe };
}
