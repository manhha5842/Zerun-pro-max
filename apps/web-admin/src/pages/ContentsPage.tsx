import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet, apiPost } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

type Content = {
  id: string;
  code: string;
  platform: string;
  status: string;
  originalText: string;
  createdAt: string;
  scheduledTargets?: string[] | null;
  publishAttempts?: Array<{ targetId: string }>;
  source?: { name: string } | null;
};

const statusLabel: Record<string, string> = {
  ready_to_publish: "Sẵn sàng",
  scheduled: "Đã lên lịch",
  published: "Đã đăng",
  publishing: "Đang đăng",
  failed: "Lỗi",
  draft: "Nháp",
  discovered: "Mới tạo",
  processing: "Đang xử lý"
};

type ContentsData = { contents: Content[] };

const platformLabel: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  x: "X / Twitter",
  "zalo-bot": "Zalo Bot",
  "zalo-web": "Zalo Web"
};

const quickTabs = [
  { value: "all", label: "Tất cả" },
  { value: "ready_to_publish", label: "Sẵn sàng" },
  { value: "scheduled", label: "Đã lên lịch" },
  { value: "failed", label: "Lỗi" },
  { value: "published", label: "Đã đăng" }
] as const;

function truncate(text: string, max: number) {
  if (!text) return "—";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function ContentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [rescheduleMap, setRescheduleMap] = useState<Record<string, string>>({});
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const statusFilter = searchParams.get("status") ?? "all";

  const query = useQuery({
    queryKey: ["contents", statusFilter],
    queryFn: () =>
      apiGet<ContentsData>(`/contents?limit=100${statusFilter !== "all" ? `&status=${statusFilter}` : ``}`)
  });

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const all = query.data?.contents ?? [];
    if (!kw) return all;
    return all.filter((c) =>
      [c.code, c.platform, c.source?.name ?? "", c.originalText, c.status]
        .join(" ")
        .toLowerCase()
        .includes(kw)
    );
  }, [keyword, query.data?.contents]);

  async function retryFailed(content: Content) {
    const targetIds =
      Array.isArray(content.scheduledTargets) && content.scheduledTargets.length > 0
        ? content.scheduledTargets
        : [...new Set((content.publishAttempts ?? []).map((a) => a.targetId))];
    try {
      setBusyCode(content.code);
      await apiPost(`/failed/${content.code}/retry`, { targetIds });
      await query.refetch();
    } finally {
      setBusyCode(null);
    }
  }

  async function rescheduleFailed(content: Content) {
    const scheduledAt = rescheduleMap[content.code];
    if (!scheduledAt) return;
    try {
      setBusyCode(content.code);
      await apiPost(`/failed/${content.code}/reschedule`, { scheduledAt });
      await query.refetch();
    } finally {
      setBusyCode(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Quản lý bài viết"
        subtitle="Kho nội dung đã tạo. Lọc theo trạng thái, mở chi tiết để sửa hoặc đăng lại."
        actions={
          <div className="actions">
            <Link to="/contents/new">
              <Button>Tạo bài mới</Button>
            </Link>
            <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>
              Làm mới
            </Button>
          </div>
        }
      />

      <SectionCard>
        {/* Quick tabs + search */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {quickTabs.map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  className="muted-chip"
                  onClick={() => setSearchParams(tab.value === "all" ? {} : { status: tab.value })}
                  style={{
                    cursor: "pointer",
                    borderColor: active ? "var(--color-primary)" : undefined,
                    background: active ? "#e8f4ef" : undefined,
                    color: active ? "var(--color-primary)" : undefined,
                    fontWeight: active ? 800 : undefined
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="contents-search" style={{ minWidth: 240 }}>
            <Search aria-hidden size={15} />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo mã, nền tảng, nội dung..."
            />
          </div>
        </div>

        {/* Table */}
        {query.isLoading ? (
          <div className="text-muted" style={{ padding: 16 }}>Đang tải...</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Chưa có bài viết"
            description={
              keyword
                ? "Không tìm thấy bài nào khớp từ khóa."
                : "Bài crawl, import hoặc nhập tay sẽ xuất hiện tại đây."
            }
          />
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Mã bài</th>
                <th>Nội dung</th>
                <th style={{ width: 140 }}>Nguồn</th>
                <th style={{ width: 110 }}>Nền tảng</th>
                <th style={{ width: 120 }}>Trạng thái</th>
                <th style={{ width: 150 }}>Ngày tạo</th>
                <th style={{ width: 190 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((content) => (
                <Fragment key={content.id}>
                  <tr
                    style={{
                      background: content.status === "failed" && expandedCode === content.code
                        ? "#fff8f7"
                        : undefined
                    }}
                  >
                    <td>
                      <Link to={`/contents/${content.code}`} style={{ color: "inherit", textDecoration: "none" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <code style={{ fontSize: 12, fontWeight: 700 }}>{content.code}</code>
                          <span className="table-subtle">Mở chi tiết</span>
                        </div>
                      </Link>
                    </td>
                    <td style={{ maxWidth: 420 }}>
                      <Link to={`/contents/${content.code}`} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 13, color: "#17201b", lineHeight: 1.45 }}>
                            {truncate(content.originalText?.trim(), 120)}
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: content.source?.name ? "#17201b" : "#68746d" }}>
                        {content.source?.name ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className="table-tag">
                        {platformLabel[content.platform] ?? content.platform}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <StatusBadge status={content.status} />
                        <span className="table-subtle">{statusLabel[content.status] ?? content.status}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap", color: "#68746d" }}>
                      {new Date(content.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td>
                      <div className="actions" style={{ gap: 6 }}>
                        <Link to={`/contents/${content.code}`}>
                          <Button size="sm" variant="secondary" icon={<ExternalLink size={12} aria-hidden />}>
                            Xem chi tiết
                          </Button>
                        </Link>
                        {content.status === "failed" && (
                          <Button
                            size="sm"
                            disabled={busyCode === content.code}
                            onClick={() => {
                              setExpandedCode(expandedCode === content.code ? null : content.code);
                            }}
                          >
                            Đăng lại
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Inline retry/reschedule row for failed */}
                  {content.status === "failed" && expandedCode === content.code && (
                    <tr style={{ background: "#fff8f7" }}>
                      <td />
                      <td colSpan={5} style={{ paddingTop: 4, paddingBottom: 12 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <Button
                            size="sm"
                            disabled={busyCode === content.code}
                            onClick={() => retryFailed(content)}
                          >
                            Đăng lại ngay
                          </Button>
                          <span style={{ fontSize: 12, color: "#9ca3af" }}>hoặc hẹn lại lúc</span>
                          <Input
                            type="datetime-local"
                            value={rescheduleMap[content.code] ?? ""}
                            onChange={(e) =>
                              setRescheduleMap((prev) => ({ ...prev, [content.code]: e.target.value }))
                            }
                            style={{ width: 200, height: 34 }}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyCode === content.code || !rescheduleMap[content.code]}
                            onClick={() => rescheduleFailed(content)}
                          >
                            Hẹn giờ lại
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}
