import {
  CATEGORY_CONFIDENCE_REVIEW_THRESHOLD,
  normalizeAffiliateCategories,
  targetMatchesCategories,
  type AffiliateCategory
} from "@zerun/shared";

export type RoutingRuleLike = {
  targetId: string;
  isActive: boolean;
  autoPublish: boolean;
  useAI: boolean;
  requireReview: boolean;
  targetCategories?: readonly string[];
  filterMode?: "all" | "category" | string;
  allowGeneralContent?: boolean;
};

export type RoutingInput = {
  analysisCategories?: readonly string[];
  categoryConfidence?: number | null;
  isGeneralContent?: boolean;
};

export type ResolvedRouting = {
  targetIds: string[];
  autoPublishTargetIds: string[];
  requiresManualReview: boolean;
  useAI: boolean;
  matchedTargetIds: string[];
  unmatchedTargetIds: string[];
  analysisCategories: AffiliateCategory[];
  holdReason?: "low_category_confidence" | "no_matching_target";
};

export function resolveRouting(rules: RoutingRuleLike[], input: RoutingInput = {}): ResolvedRouting {
  const activeRules = rules.filter((rule) => rule.isActive);
  const analysisCategories = normalizeAffiliateCategories(input.analysisCategories ?? []);
  const categoryConfidence = typeof input.categoryConfidence === "number" ? input.categoryConfidence : null;
  const hasCategoryFilteredTargets = activeRules.some((rule) => rule.filterMode === "category");
  const shouldFilterByCategory = analysisCategories.length > 0 || hasCategoryFilteredTargets;
  const matchedRules = activeRules.filter((rule) => {
    if (rule.filterMode !== "category") return true;
    if (input.isGeneralContent && rule.allowGeneralContent !== false) return true;
    const targetCategories = normalizeAffiliateCategories(rule.targetCategories ?? []);
    if (analysisCategories.length === 0 || targetCategories.length === 0) return false;
    return targetMatchesCategories(analysisCategories, targetCategories);
  });
  const targetIds = Array.from(new Set(matchedRules.map((rule) => rule.targetId)));
  const matchedTargetIds = targetIds;
  const unmatchedTargetIds = activeRules
    .map((rule) => rule.targetId)
    .filter((targetId) => !matchedTargetIds.includes(targetId));
  const lowCategoryConfidence = categoryConfidence !== null && categoryConfidence < CATEGORY_CONFIDENCE_REVIEW_THRESHOLD;
  const noMatchingTarget = shouldFilterByCategory && activeRules.length > 0 && matchedRules.length === 0;

  return {
    targetIds,
    autoPublishTargetIds: lowCategoryConfidence || noMatchingTarget
      ? []
      : Array.from(new Set(matchedRules.filter((rule) => rule.autoPublish && !rule.requireReview).map((rule) => rule.targetId))),
    requiresManualReview:
      activeRules.length === 0 ||
      matchedRules.length === 0 ||
      lowCategoryConfidence ||
      matchedRules.some((rule) => rule.requireReview || !rule.autoPublish),
    useAI: activeRules.some((rule) => rule.useAI),
    matchedTargetIds,
    unmatchedTargetIds,
    analysisCategories,
    holdReason: noMatchingTarget ? "no_matching_target" : lowCategoryConfidence ? "low_category_confidence" : undefined
  };
}
