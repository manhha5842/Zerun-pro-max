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

type MetricsData = {
  crawl: { crawlResults: number; contents: number; duplicates: number; dedupRate: number };
  ai: { calls: number; avgConfidence: number | null; totalTokens: number; avgTokens: number; sampleSize: number };
  convert: { converted: number; failed: number; attempted: number; successRate: number | null; byStatus: Record<string, number> };
  publish: { byTarget: Array<{ id: string; name: string; platform: string; success: number; failed: number; other: number }> };
};

type ComparisonData = {
  bySource: Array<{ sourceId: string; sourceName: string; agree: number; disagree: number; total: number; accuracy: number | null }>;
  overall: { agree: number; total: number; accuracy: number | null };
};

const pct = (value: number | null) => (value == null ? "—" : `${Math.round(value * 100)}%`);

export function DashboardPage() {
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => apiGet<DashboardData>("/dashboard/stats") });
  const activity = useQuery({ queryKey: ["dashboard-activity"], queryFn: () => apiGet<ActivityData>("/dashboard/activity?limit=24") });
  const metrics = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => apiGet<MetricsData>("/dashboard/metrics"),
    refetchInterval: 15_000
  });
  const comparison = useQuery({
    queryKey: ["dashboard-ai-comparison"],
    queryFn: () => apiGet<ComparisonData>("/dashboard/ai-comparison"),
    refetchInterval: 30_000
  });

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Theo dõi nhanh nội dung, hàng chờ và tình trạng tài khoản đăng." />

      <section className="grid-metrics" style={{ marginBottom: 18 }}>
        <StatsCard label="Tổng bài viết" value={stats.data?.totalContents ?? 0} icon={<FileText aria-hidden />} />
        <StatsCard label="Đang chờ" value={stats.data?.pendingJobs ?? 0} icon={<Clock aria-hidden />} />
        <StatsCard label="Đã đăng hôm nay" value={stats.data?.publishedToday ?? 0} icon={<CheckCircle2 aria-hidden />} />
        <StatsCard label="Lỗi" value={stats.data?.failedJobs ?? 0} icon={<AlertTriangle aria-hidden />} />
      </section>

      <section style={{ marginTop: 18 }}>
        <SectionCard title="Số liệu vận hành" description="Crawl/dedup · AI · convert · đăng bài theo target (tự làm mới mỗi 15s).">
          <div className="grid-metrics" style={{ gap: 12 }}>
            <div className="metric-block">
              <div className="metric-block-title">Crawl &amp; dedup</div>
              <div className="metric-block-row"><span>Crawl results</span><strong>{metrics.data?.crawl.crawlResults ?? 0}</strong></div>
              <div className="metric-block-row"><span>Nội dung</span><strong>{metrics.data?.crawl.contents ?? 0}</strong></div>
              <div className="metric-block-row"><span>Trùng lặp</span><strong>{metrics.data?.crawl.duplicates ?? 0} ({pct(metrics.data?.crawl.dedupRate ?? null)})</strong></div>
            </div>
            <div className="metric-block">
              <div className="metric-block-title">AI</div>
              <div className="metric-block-row"><span>Số lần gọi</span><strong>{metrics.data?.ai.calls ?? 0}</strong></div>
              <div className="metric-block-row"><span>Confidence TB</span><strong>{pct(metrics.data?.ai.avgConfidence ?? null)}</strong></div>
              <div className="metric-block-row"><span>Token (tổng / TB)</span><strong>{metrics.data?.ai.totalTokens ?? 0} / {metrics.data?.ai.avgTokens ?? 0}</strong></div>
            </div>
            <div className="metric-block">
              <div className="metric-block-title">Convert affiliate</div>
              <div className="metric-block-row"><span>Thành công</span><strong>{metrics.data?.convert.converted ?? 0}</strong></div>
              <div className="metric-block-row"><span>Thất bại</span><strong>{metrics.data?.convert.failed ?? 0}</strong></div>
              <div className="metric-block-row"><span>Tỉ lệ thành công</span><strong>{pct(metrics.data?.convert.successRate ?? null)}</strong></div>
            </div>
            <div className="metric-block">
              <div className="metric-block-title">Đăng bài theo target</div>
              {(metrics.data?.publish.byTarget ?? []).length === 0 ? (
                <div className="table-subtle">Chưa có lượt đăng nào.</div>
              ) : (
                (metrics.data?.publish.byTarget ?? []).slice(0, 6).map((t) => (
                  <div key={t.id} className="metric-block-row">
                    <span>{t.name}</span>
                    <strong>
                      <span style={{ color: "var(--success, #16a34a)" }}>{t.success}✓</span>{" / "}
                      <span style={{ color: "var(--danger, #dc2626)" }}>{t.failed}✗</span>
                    </strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionCard>
      </section>

      <section style={{ marginTop: 18 }}>
        <SectionCard
          title="AI vs người duyệt"
          description={`Độ chính xác AI theo nguồn (AI định đăng vs người thực sự đăng). Tổng: ${pct(comparison.data?.overall.accuracy ?? null)} (${comparison.data?.overall.agree ?? 0}/${comparison.data?.overall.total ?? 0}).`}
        >
          {(comparison.data?.bySource ?? []).length === 0 ? (
            <div className="empty-state">Chưa đủ dữ liệu so sánh (cần tin có cả quyết định AI và người duyệt).</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Nguồn</th>
                  <th style={{ width: 90, textAlign: "right" }}>Khớp</th>
                  <th style={{ width: 90, textAlign: "right" }}>Lệch</th>
                  <th style={{ width: 110, textAlign: "right" }}>Độ chính xác</th>
                </tr>
              </thead>
              <tbody>
                {(comparison.data?.bySource ?? []).map((row) => (
                  <tr key={row.sourceId}>
                    <td>{row.sourceName}</td>
                    <td style={{ textAlign: "right" }}>{row.agree}</td>
                    <td style={{ textAlign: "right" }}>{row.disagree}</td>
                    <td style={{ textAlign: "right" }}><strong>{pct(row.accuracy)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
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
