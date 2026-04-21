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
  const activity = useQuery({ queryKey: ["dashboard-activity"], queryFn: () => apiGet<ActivityData>("/dashboard/activity?limit=24") });

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Theo dõi nhanh nội dung, hàng chờ và tình trạng tài khoản đăng." />

      <section className="grid-metrics" style={{ marginBottom: 18 }}>
        <StatsCard label="Tổng bài viết" value={stats.data?.totalContents ?? 0} icon={<FileText aria-hidden />} />
        <StatsCard label="Đang chờ" value={stats.data?.pendingJobs ?? 0} icon={<Clock aria-hidden />} />
        <StatsCard label="Đã đăng hôm nay" value={stats.data?.publishedToday ?? 0} icon={<CheckCircle2 aria-hidden />} />
        <StatsCard label="Lỗi" value={stats.data?.failedJobs ?? 0} icon={<AlertTriangle aria-hidden />} />
      </section>

      <section className="split" style={{ marginTop: 18 }}>
        <SectionCard title="Hoạt động gần đây" description="Các thay đổi mới nhất của hệ thống đăng bài.">
          {(activity.data?.activities ?? []).length === 0 ? (
            <div className="empty-state">Chưa có hoạt động nào.</div>
          ) : (
            <table className="table table-compact">
              <tbody>
                {(activity.data?.activities ?? []).map((item) => (
                  <tr key={item.id}>
                    <td style={{ width: 170 }}>{new Date(item.createdAt).toLocaleString("vi-VN")}</td>
                    <td>{item.message}</td>
                    <td style={{ width: 100 }}>
                      {item.platform ? <span className="table-tag">{item.platform}</span> : <span className="table-subtle">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title="Tình trạng tài khoản" description="Kiểm tra nhanh account nào đang ổn, account nào cần xử lý session.">
          <div className="stack-tight">
            {(stats.data?.platformHealth ?? []).map((account) => (
              <div key={account.id} className="simple-row">
                <div className="simple-row-main">
                  <div className="simple-row-title">
                    <PlatformLogo platform={account.platform as never} />
                    <span>{account.name}</span>
                  </div>
                  <div className="table-subtle">{account.isActive ? "Đang bật" : "Đang tắt"}</div>
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
