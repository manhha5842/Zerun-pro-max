import {
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
  analysisCategories: string[];
  holdReason?: "no_matching_target";
};

const SIMPLE_CATEGORY_ALIASES: Record<string, string[]> = {
  beauty: ["Sức Khỏe & Sắc Đẹp"],
  mom_baby: ["Mẹ & Bé"],
  electronics: ["Thiết Bị Điện Tử", "Điện Thoại & Phụ Kiện", "Máy Tính & Laptop"],
  home: ["Nhà Cửa & Đời Sống", "Nội Thất & Trang Trí Nhà", "Chăm Sóc Nhà Cửa"],
  fashion: ["Thời Trang Nam", "Thời Trang Nữ", "Phụ Kiện Thời Trang", "Giày Dép Nam", "Giày Dép Nữ"],
  general: ["Voucher & Dịch Vụ"]
};

function normalizeRoutingCategories(value: unknown): string[] {
  const normalized = normalizeAffiliateCategories(value);
  const raw = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? value.split(",").map((item) => item.trim())
      : [];
  const expanded = raw.flatMap((item) => {
    const key = item.trim().toLowerCase();
    return [item.trim(), ...(SIMPLE_CATEGORY_ALIASES[key] ?? [])];
  });
  return Array.from(new Set([...normalized, ...expanded].filter(Boolean)));
}

export function resolveRouting(rules: RoutingRuleLike[], input: RoutingInput = {}): ResolvedRouting {
  const activeRules = rules.filter((rule) => rule.isActive);
  const analysisCategories = normalizeRoutingCategories(input.analysisCategories ?? []);
  const hasCategoryFilteredTargets = activeRules.some((rule) => rule.filterMode === "category");
  const shouldFilterByCategory = analysisCategories.length > 0 || hasCategoryFilteredTargets;
  const matchedRules = activeRules.filter((rule) => {
    if (rule.filterMode !== "category") return true;
    if (input.isGeneralContent && rule.allowGeneralContent !== false) return true;
    const targetCategories = normalizeRoutingCategories(rule.targetCategories ?? []);
    if (analysisCategories.length === 0 || targetCategories.length === 0) return false;
    return targetMatchesCategories(analysisCategories, targetCategories);
  });
  const targetIds = Array.from(new Set(matchedRules.map((rule) => rule.targetId)));
  const matchedTargetIds = targetIds;
  const unmatchedTargetIds = activeRules
    .map((rule) => rule.targetId)
    .filter((targetId) => !matchedTargetIds.includes(targetId));
  const noMatchingTarget = shouldFilterByCategory && activeRules.length > 0 && matchedRules.length === 0;

  return {
    targetIds,
    autoPublishTargetIds: noMatchingTarget ? [] : targetIds,
    requiresManualReview:
      activeRules.length === 0 ||
      matchedRules.length === 0,
    useAI: activeRules.some((rule) => rule.useAI),
    matchedTargetIds,
    unmatchedTargetIds,
    analysisCategories,
    holdReason: noMatchingTarget ? "no_matching_target" : undefined
  };
}
