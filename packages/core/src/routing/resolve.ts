export type RoutingRuleLike = {
  targetId: string;
  isActive: boolean;
  autoPublish: boolean;
  useAI: boolean;
  requireReview: boolean;
};

export type ResolvedRouting = {
  targetIds: string[];
  autoPublishTargetIds: string[];
  requiresManualReview: boolean;
  useAI: boolean;
};

export function resolveRouting(rules: RoutingRuleLike[]): ResolvedRouting {
  const activeRules = rules.filter((rule) => rule.isActive);
  const targetIds = activeRules.map((rule) => rule.targetId);

  return {
    targetIds,
    autoPublishTargetIds: activeRules.filter((rule) => rule.autoPublish && !rule.requireReview).map((rule) => rule.targetId),
    requiresManualReview: activeRules.length === 0 || activeRules.some((rule) => rule.requireReview || !rule.autoPublish),
    useAI: activeRules.some((rule) => rule.useAI)
  };
}
