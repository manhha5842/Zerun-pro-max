import { ReactNode } from "react";

export function StatsCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="panel metric">
      <div className="flex items-center justify-between gap-3">
        <p className="metric-label">{label}</p>
        {icon}
      </div>
      <p className="metric-value">{value}</p>
    </div>
  );
}
