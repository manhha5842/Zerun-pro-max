import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, TestTube2 } from "lucide-react";
import { Button } from "../ui/Button";
import { MethodStatusBadge, type MethodStatus } from "./MethodStatusBadge";

type AffiliateMethodCardProps = {
  id: string;
  title: string;
  description: string;
  requirement?: string;
  status: MethodStatus;
  expanded: boolean;
  disabled?: boolean;
  testLabel?: string;
  testDisabled?: boolean;
  testLoading?: boolean;
  error?: string | null;
  result?: string | null;
  onToggle: () => void;
  onTest?: () => void;
  children?: ReactNode;
};

export function AffiliateMethodCard({
  id,
  title,
  description,
  requirement,
  status,
  expanded,
  disabled,
  testLabel = "Test",
  testDisabled,
  testLoading,
  error,
  result,
  onToggle,
  onTest,
  children
}: AffiliateMethodCardProps) {
  return (
    <section className={`affiliate-method-card ${expanded ? "expanded" : ""} ${disabled ? "disabled" : ""}`} aria-labelledby={`${id}-title`}>
      <button type="button" className="affiliate-method-head" onClick={onToggle} aria-expanded={expanded}>
        <span>
          <strong id={`${id}-title`}>{title}</strong>
          <small>{description}</small>
        </span>
        <span className="affiliate-method-head-actions">
          <MethodStatusBadge status={status} />
          {expanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </span>
      </button>

      {expanded ? (
        <div className="affiliate-method-body">
          {requirement ? <p className="affiliate-method-requirement">{requirement}</p> : null}
          {children}
          {error ? <p className="field-error">{error}</p> : null}
          {result ? <p className="field-hint success">{result}</p> : null}
          {onTest ? (
            <div className="actions">
              <Button
                size="sm"
                variant="secondary"
                icon={<TestTube2 size={14} aria-hidden />}
                onClick={onTest}
                disabled={disabled || testDisabled || testLoading}
              >
                {testLoading ? "Đang test..." : testLabel}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
