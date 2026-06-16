import { normalizeAffiliateCategories, targetMatchesCategories } from "@zerun/shared/categories";
import { Badge } from "../ui/Badge";

export function TargetMatchBadge({
  acceptedCategories,
  analysisCategories = []
}: {
  acceptedCategories: readonly string[];
  analysisCategories?: readonly string[];
}) {
  const accepted = normalizeAffiliateCategories(acceptedCategories);
  const analysis = normalizeAffiliateCategories(analysisCategories);
  const matched = accepted.filter((category) => analysis.includes(category));

  if (accepted.length === 0) {
    return <Badge tone="good">Tổng hợp, nhận mọi ngành</Badge>;
  }

  if (analysis.length === 0) {
    return <Badge tone="neutral">{accepted.length} ngành đã cấu hình</Badge>;
  }

  if (!targetMatchesCategories(analysis, accepted)) {
    return <Badge tone="danger">Không match ngành</Badge>;
  }

  return (
    <div className="target-match-badges">
      {matched.map((category) => (
        <Badge key={category} tone="good">{category}</Badge>
      ))}
    </div>
  );
}
