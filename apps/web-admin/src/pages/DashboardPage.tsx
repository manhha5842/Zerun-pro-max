import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, FileText } from "lucide-react";
import { apiGet } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
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
      <PageHeader title="Bảng điều khiển" subtitle="Theo dõi nội dung, hàng đợi và sức khỏe các tài khoản thật." />

      <section className="grid-metrics">
        <StatsCard label="Tổng nội dung" value={stats.data?.totalContents ?? 0} icon={<FileText aria-hidden />} />
        <StatsCard label="Đang chờ xử lý" value={stats.data?.pendingJobs ?? 0} icon={<Clock aria-hidden />} />
        <StatsCard label="Đã đăng hôm nay" value={stats.data?.publishedToday ?? 0} icon={<CheckCircle2 aria-hidden />} />
        <StatsCard label="Thất bại" value={stats.data?.failedJobs ?? 0} icon={<AlertTriangle aria-hidden />} />
      </section>

      <section className="split" style={{ marginTop: 18 }}>
        <SectionCard title="Hoạt động gần đây">
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
        </SectionCard>
        <SectionCard title="Sức khỏe nền tảng">
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
        </SectionCard>
      </section>
    </>
  );
}

