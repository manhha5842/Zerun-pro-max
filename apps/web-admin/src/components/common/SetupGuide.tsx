import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "../ui/Badge";

export type SetupGuideStatus = "ready" | "manual" | "pending" | "blocked";

export type SetupGuideStep = {
  title: string;
  description: ReactNode;
  status?: SetupGuideStatus;
  verification?: ReactNode;
  href?: string;
  linkLabel?: string;
  command?: string;
};

const statusMeta: Record<SetupGuideStatus, { label: string; tone: "good" | "warn" | "danger" | "neutral" }> = {
  ready: { label: "Có thể làm ngay", tone: "good" },
  manual: { label: "Cần thao tác tay", tone: "warn" },
  pending: { label: "Chưa kiểm thử thực tế", tone: "neutral" },
  blocked: { label: "Chưa hỗ trợ", tone: "danger" }
};

export function SetupGuide({
  title = "Hướng dẫn thiết lập",
  description,
  steps
}: {
  title?: string;
  description?: string;
  steps: SetupGuideStep[];
}) {
  return (
    <div className="setup-guide">
      <div className="setup-guide-head">
        <Badge tone="neutral">Setup</Badge>
        <div>
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <ol className="setup-guide-steps">
        {steps.map((step, index) => (
          <li key={`${step.title}-${index}`}>
            <span className="setup-step-index">{index + 1}</span>
            <div className="setup-step-content">
              <div className="setup-step-title">
                <strong>{step.title}</strong>
                {step.status ? <Badge tone={statusMeta[step.status].tone}>{statusMeta[step.status].label}</Badge> : null}
              </div>
              <div className="setup-step-description">{step.description}</div>
              {step.command ? <code className="setup-command">{step.command}</code> : null}
              {step.href ? (
                <a className="setup-guide-link" href={step.href} target="_blank" rel="noreferrer">
                  {step.linkLabel ?? "Mở trang hướng dẫn"}
                  <ExternalLink aria-hidden size={14} />
                </a>
              ) : null}
              {step.verification ? (
                <div className="setup-verification">
                  <strong>Hoàn tất khi:</strong> {step.verification}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
