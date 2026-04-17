import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock, FileText } from "lucide-react";
import { apiGet } from "../api/client";
import { StatusBadge } from "../components/common/StatusBadge";
import { StatsCard } from "../components/common/StatsCard";
import { PlatformLogo } from "../components/common/PlatformLogo";

type DashboardData = {
  totalContents: number;
  pendingJobs: number;
  publishedToday: number;
  failedJobs: number;
  platformHealth: Array<{ id: string; name: string; platform: string; health: string; isActive: boolean }>;
};

type ActivityData = {
  activities: Array<{ id: string; type: string; message: string; platform?: string; createdAt: string }>;
};

export function DashboardPage() {
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => apiGet<DashboardData>("/dashboard/stats") });
  const activity = useQuery({ queryKey: ["dashboard-activity"], queryFn: () => apiGet<ActivityData>("/dashboard/activity?limit=40") });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Bảng điều khiển</h1>
          <p className="page-subtitle">Theo dõi nội dung, hàng đợi và sức khỏe các tài khoản thật.</p>
        </div>
      </header>

      <section className="grid-metrics">
        <StatsCard label="Tổng nội dung" value={stats.data?.totalContents ?? 0} icon={<FileText aria-hidden />} />
        <StatsCard label="Đang chờ xử lý" value={stats.data?.pendingJobs ?? 0} icon={<Clock aria-hidden />} />
        <StatsCard label="Đã đăng hôm nay" value={stats.data?.publishedToday ?? 0} icon={<CheckCircle2 aria-hidden />} />
        <StatsCard label="Thất bại" value={stats.data?.failedJobs ?? 0} icon={<AlertTriangle aria-hidden />} />
      </section>

      <section className="split" style={{ marginTop: 18 }}>
        <div className="panel panel-pad">
          <h2>Hoạt động gần đây</h2>
          <table className="table">
            <tbody>
              {(activity.data?.activities ?? []).map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString("vi-VN")}</td>
                  <td>{item.message}</td>
                  <td>{item.platform ? <span className="text-xs font-semibold uppercase">{item.platform}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel panel-pad">
          <h2>Sức khỏe nền tảng</h2>
          <div className="flex flex-col gap-3">
            {(stats.data?.platformHealth ?? []).map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <PlatformLogo platform={account.platform as any} />
                  <span>{account.name}</span>
                </div>
                <StatusBadge status={account.health} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

