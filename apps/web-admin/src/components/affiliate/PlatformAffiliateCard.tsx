import type { CSSProperties, ReactNode } from "react";
import { Save } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import type { MethodStatus } from "./MethodStatusBadge";

export type AffiliateMethodOption<T extends string> = {
  value: T;
  label: string;
  status: MethodStatus;
  disabled?: boolean;
};

type PlatformStatus = "disabled" | "missing" | "ready" | "test_success" | "test_failed";

type PlatformAffiliateCardProps<T extends string> = {
  platformName: string;
  description: string;
  accent?: string;
  enabled: boolean;
  status: PlatformStatus;
  defaultMethod: T;
  fallbackEnabled?: boolean;
  fallbackMethod?: T;
  methods: Array<AffiliateMethodOption<T>>;
  hideMethodSelectors?: boolean;
  isSaving?: boolean;
  children: ReactNode;
  onEnabledChange: (enabled: boolean) => void;
  onDefaultMethodChange: (method: T) => void;
  onFallbackEnabledChange?: (enabled: boolean) => void;
  onFallbackMethodChange?: (method: T) => void;
  onSave?: () => void;
};

const statusLabels: Record<PlatformStatus, string> = {
  disabled: "Disabled",
  missing: "Missing config",
  ready: "Ready",
  test_success: "Test success",
  test_failed: "Test failed"
};

function statusTone(status: PlatformStatus): "neutral" | "good" | "warn" | "danger" {
  if (status === "ready" || status === "test_success") return "good";
  if (status === "test_failed") return "danger";
  if (status === "missing") return "warn";
  return "neutral";
}

function isSelectable(status: MethodStatus, disabled?: boolean) {
  return !disabled && (status === "configured" || status === "test_passed");
}

export function PlatformAffiliateCard<T extends string>({
  platformName,
  description,
  accent,
  enabled,
  status,
  defaultMethod,
  fallbackEnabled,
  fallbackMethod,
  methods,
  hideMethodSelectors,
  isSaving,
  children,
  onEnabledChange,
  onDefaultMethodChange,
  onFallbackEnabledChange,
  onFallbackMethodChange,
  onSave
}: PlatformAffiliateCardProps<T>) {
  const selectableMethods = methods.filter((method) => isSelectable(method.status, method.disabled));

  return (
    <section className="platform-affiliate-card" style={accent ? { "--platform-accent": accent } as CSSProperties : undefined}>
      <div className="platform-affiliate-accent" />
      <div className="platform-affiliate-head">
        <div>
          <div className="platform-affiliate-title">
            <h2>{platformName}</h2>
            <Badge tone={statusTone(status)}>{statusLabels[status]}</Badge>
          </div>
          <p>{description}</p>
        </div>
        <label className="switch-row">
          <span>{enabled ? "Đang bật" : "Đang tắt"}</span>
          <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
        </label>
      </div>

      {!hideMethodSelectors ? (
        <div className={`platform-method-selectors ${enabled ? "" : "disabled"}`}>
          <label>
            <Label>Phương thức chuyển đổi mặc định</Label>
            <Select value={defaultMethod} onChange={(event) => onDefaultMethodChange(event.target.value as T)} disabled={!enabled || selectableMethods.length === 0}>
              {methods.map((method) => (
                <option key={method.value} value={method.value} disabled={!isSelectable(method.status, method.disabled)}>
                  {method.label}{isSelectable(method.status, method.disabled) ? "" : " · thiếu cấu hình"}
                </option>
              ))}
            </Select>
          </label>
          {typeof fallbackEnabled === "boolean" && fallbackMethod && onFallbackEnabledChange && onFallbackMethodChange ? (
            <div className="fallback-method-block">
              <label className="checkbox-field">
                <input type="checkbox" checked={fallbackEnabled} onChange={(event) => onFallbackEnabledChange(event.target.checked)} disabled={!enabled} />
                <span>
                  <strong>Dùng phương thức dự phòng khi phương thức chính lỗi</strong>
                  <small>Fallback cũng chỉ chọn được method đã đủ cấu hình.</small>
                </span>
              </label>
              {fallbackEnabled ? (
                <label>
                  <Label>Phương thức dự phòng</Label>
                  <Select value={fallbackMethod} onChange={(event) => onFallbackMethodChange(event.target.value as T)} disabled={!enabled || selectableMethods.length === 0}>
                    {methods.map((method) => (
                      <option key={method.value} value={method.value} disabled={!isSelectable(method.status, method.disabled)}>
                        {method.label}{isSelectable(method.status, method.disabled) ? "" : " · thiếu cấu hình"}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`platform-method-list ${enabled ? "" : "disabled"}`}>
        {children}
      </div>

      {onSave ? (
        <div className="platform-affiliate-footer">
          <Button icon={<Save size={15} aria-hidden />} onClick={onSave} disabled={isSaving}>
            Lưu {platformName}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
