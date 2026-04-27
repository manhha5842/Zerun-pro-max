import type { ReactNode } from "react";

export function BulkActionBar({
  selectedCount,
  allMatchingSelected,
  onSelectAllMatching,
  onClear,
  children
}: {
  selectedCount: number;
  allMatchingSelected?: boolean;
  onSelectAllMatching?: () => void;
  onClear?: () => void;
  children: ReactNode;
}) {
  if (selectedCount === 0 && !allMatchingSelected) return null;

  return (
    <div className="bulk-action-bar">
      <span>
        {allMatchingSelected ? "Đã chọn tất cả bài viết khớp bộ lọc" : `Đã chọn ${selectedCount} dòng`}
      </span>
      <div className="actions">
        {onSelectAllMatching && !allMatchingSelected ? (
          <button type="button" className="link-button" onClick={onSelectAllMatching}>
            Chọn tất cả khớp bộ lọc
          </button>
        ) : null}
        {children}
        {onClear ? (
          <button type="button" className="link-button" onClick={onClear}>
            Bỏ chọn
          </button>
        ) : null}
      </div>
    </div>
  );
}
