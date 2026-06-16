import { useMemo, useState } from "react";
import { affiliateCategories, normalizeAffiliateCategories, type AffiliateCategory } from "@zerun/shared/categories";
import { X } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export function CategoryMultiSelect({
  value,
  onChange,
  emptyLabel = "Để trống nghĩa là cho phép mọi ngành",
  disabled
}: {
  value: readonly string[];
  onChange: (value: AffiliateCategory[]) => void;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const selected = useMemo(() => normalizeAffiliateCategories(value), [value]);
  const [keyword, setKeyword] = useState("");
  const filteredCategories = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return affiliateCategories;
    return affiliateCategories.filter((category) => category.toLowerCase().includes(query));
  }, [keyword]);

  const selectedSet = new Set(selected);
  const toggle = (category: AffiliateCategory) => {
    if (disabled) return;
    const next = selectedSet.has(category)
      ? selected.filter((item) => item !== category)
      : [...selected, category];
    onChange(normalizeAffiliateCategories(next));
  };

  return (
    <div className="category-select">
      <div className="category-select-toolbar">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Tìm ngành hàng..."
          disabled={disabled}
        />
        <Button type="button" variant="secondary" onClick={() => onChange([...affiliateCategories])} disabled={disabled}>
          Chọn tất cả
        </Button>
        <Button type="button" variant="ghost" onClick={() => onChange([])} disabled={disabled}>
          Xóa chọn
        </Button>
      </div>

      <div className="category-chip-list" aria-label="Ngành đã chọn">
        {selected.length === 0 ? (
          <span className="table-subtle">{emptyLabel}</span>
        ) : (
          selected.map((category) => (
            <Badge key={category} tone="good" className="category-selected-chip">
              {category}
              <button type="button" onClick={() => toggle(category)} disabled={disabled} aria-label={`Bỏ chọn ${category}`}>
                <X aria-hidden size={12} />
              </button>
            </Badge>
          ))
        )}
      </div>

      <div className="category-option-grid">
        {filteredCategories.map((category) => (
          <label key={category} className={`category-option ${selectedSet.has(category) ? "selected" : ""}`}>
            <input
              type="checkbox"
              checked={selectedSet.has(category)}
              onChange={() => toggle(category)}
              disabled={disabled}
            />
            <span>{category}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
