import { normalizeAffiliateCategories, readAccountCategories, targetMatchesCategories } from "@zerun/shared/categories";
import { Badge } from "../ui/Badge";
import { TargetMatchBadge } from "./TargetMatchBadge";

export type RoutingPreviewAccount = {
  id: string;
  name: string;
  platform: string;
  isActive?: boolean;
  config?: Record<string, unknown> | null;
};

export type RoutingPreviewRule = {
  id: string;
  sourceId: string;
  targetId: string;
  isActive: boolean;
  autoPublish: boolean;
  requireReview: boolean;
  useAI: boolean;
};

export function RoutingPreview({
  sourceId,
  analysisCategories,
  targets,
  rules
}: {
  sourceId: string;
  analysisCategories: readonly string[];
  targets: RoutingPreviewAccount[];
  rules: RoutingPreviewRule[];
}) {
  const categories = normalizeAffiliateCategories(analysisCategories);
  const activeRules = rules.filter((rule) => rule.sourceId === sourceId && rule.isActive);
  const rows = activeRules
    .map((rule) => {
      const target = targets.find((item) => item.id === rule.targetId);
      if (!target) return null;
      const acceptedCategories = readAccountCategories(target.config, "acceptedCategories");
      const matched = categories.length === 0 || targetMatchesCategories(categories, acceptedCategories);
      return { rule, target, acceptedCategories, matched };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const matchedRows = rows.filter((row) => row.matched);

  return (
    <div className="routing-preview">
      <div className="routing-preview-head">
        <strong>Preview routing</strong>
        <span>
          {categories.length === 0
            ? "Chọn ngành để mô phỏng AI phân phối nội dung."
            : `AI đang trả ${categories.length} ngành.`}
        </span>
      </div>

      {matchedRows.length === 0 ? (
        <div className="routing-preview-empty">
          {sourceId ? "Không có đích phù hợp ngành hàng." : "Chọn nguồn để xem target sẽ nhận nội dung."}
        </div>
      ) : (
        <div className="routing-preview-list">
          {matchedRows.map(({ rule, target, acceptedCategories }) => (
            <div key={rule.id} className="routing-preview-row">
              <div>
                <strong>{target.name}</strong>
                <div className="table-subtle">{target.platform}</div>
              </div>
              <TargetMatchBadge acceptedCategories={acceptedCategories} analysisCategories={categories} />
              <Badge tone={rule.autoPublish && !rule.requireReview ? "good" : "warn"}>
                {rule.autoPublish && !rule.requireReview ? "Auto-publish" : "Cần duyệt"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
