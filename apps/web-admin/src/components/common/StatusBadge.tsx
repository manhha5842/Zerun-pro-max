import { CheckCircle2, Clock, XCircle, Pause, AlertTriangle } from "lucide-react";
import { Badge } from "../ui/Badge";

type Status = "healthy" | "degraded" | "checkpoint" | "paused" | "failed" | "active" | "draft" | "completed" | "cancelled" | "scheduled" | "publishing" | "published";

const statusConfig: Record<Status, { tone: "good" | "warn" | "danger" | "neutral"; icon?: React.ReactNode }> = {
  healthy: { tone: "good", icon: <CheckCircle2 size={12} /> },
  active: { tone: "good", icon: <CheckCircle2 size={12} /> },
  completed: { tone: "good", icon: <CheckCircle2 size={12} /> },
  published: { tone: "good", icon: <CheckCircle2 size={12} /> },
  degraded: { tone: "warn", icon: <AlertTriangle size={12} /> },
  checkpoint: { tone: "warn", icon: <Clock size={12} /> },
  scheduled: { tone: "neutral", icon: <Clock size={12} /> },
  draft: { tone: "neutral" },
  paused: { tone: "warn", icon: <Pause size={12} /> },
  publishing: { tone: "neutral", icon: <Clock size={12} /> },
  failed: { tone: "danger", icon: <XCircle size={12} /> },
  cancelled: { tone: "danger", icon: <XCircle size={12} /> }
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as Status] ?? { tone: "neutral" as const };
  
  return (
    <Badge tone={config.tone}>
      <span className="inline-flex items-center gap-1">
        {config.icon}
        {status}
      </span>
    </Badge>
  );
}
