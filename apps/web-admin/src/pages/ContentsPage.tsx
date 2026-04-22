import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, RefreshCw, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet, apiPost } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

type ContentsData = {
  contents: Array<{
    id: string;
    code: string;
    platform: string;
    status: string;
    originalText: string;
    createdAt: string;
    scheduledTargets?: string[] | null;
    publishAttempts?: Array<{ targetId: string }>;
    source?: { name: string } | null;
  }>;
};

const statusLabel: Record<string, string> = {
  ready_to_publish: "Sẵn sàng đăng",
  published: "Đã đăng",
  scheduled: "Đã lên lịch",
  publishing: "Đang đăng",
  failed: "Lỗi",
  draft: "Nháp",
  discovered: "Mới tạo",
  processing: "Đang xử lý"
};

export function ContentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [rescheduleMap, setRescheduleMap] = useState<Record<string, string>>({});
  const statusFilter = searchParams.get("status") ?? "all";

  const query = useQuery({
    queryKey: ["contents", statusFilter],
    queryFn: () => apiGet<ContentsData>(`/contents?limit=50${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`)
  });

  const filteredContents = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return query.data?.contents ?? [];

    return (query.data?.contents ?? []).filter((content) => {
      const haystack = [content.code, content.platform, content.source?.name ?? "", content.originalText, content.status].join(" ").toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }, [keyword, query.data?.contents]);

  async function retryFailed(content: ContentsData["contents"][number]) {
    const targetIds = Array.isArray(content.scheduledTargets) && content.scheduledTargets.length > 0 ? content.scheduledTargets : [...new Set((content.publishAttempts ?? []).map((attempt) => attempt.targetId))];
    try {
      setBusyCode(content.code);
      await apiPost(`/failed/${content.code}/retry`, { targetIds });
      await query.refetch();
    } finally {
      setBusyCode(null);
    }
  }

  async function rescheduleFailed(content: ContentsData["contents"][number]) {
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
        subtitle="Kho noi dung da tao. Loc theo trang thai, mo chi tiet de sua, dang lai hoac hen lai bai loi."
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

      <SectionCard
        title="Danh sach bai viet"
        description={`${filteredContents.length} bai`}
        actions={
          <div className="contents-toolbar" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div className="contents-search">
              <Search aria-hidden size={15} />
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tim theo ma, nguon, noi dung..." />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setSearchParams(event.target.value === "all" ? {} : { status: event.target.value })}
              style={{ minWidth: 170, height: 40, padding: "0 12px", borderRadius: 10, border: "1px solid var(--color-border)", background: "#fff" }}
            >
              <option value="all">Tat ca trang thai</option>
              <option value="draft">Nhap / nhap tay</option>
              <option value="ready_to_publish">San sang dang</option>
              <option value="scheduled">Da len lich</option>
              <option value="publishing">Dang dang</option>
              <option value="published">Da dang</option>
              <option value="failed">Loi</option>
            </select>
          </div>
        }
      >
        {filteredContents.length === 0 ? (
          <EmptyState title="Chưa có bài viết" description={keyword ? "Không tìm thấy bài nào khớp từ khóa." : "Bài crawl/import hoặc nhập tay sẽ xuất hiện tại đây."} />
        ) : (
          <div className="content-list">
            {filteredContents.map((content) => (
              <article key={content.id} className="content-row-card content-row-card-clean" style={{ display: "grid", gap: 12 }}>
                <Link to={`/contents/${content.code}`} className="content-row-link" style={{ color: "inherit" }}>
                  <div className="content-row-main">
                    <div className="content-row-head">
                      <div className="content-row-title-wrap">
                        <div className="content-row-code">{content.code}</div>
                        <div className="content-row-meta">
                          <span>{content.source?.name ?? content.platform}</span>
                          <span>•</span>
                          <span>{new Date(content.createdAt).toLocaleString("vi-VN")}</span>
                        </div>
                      </div>
                      <StatusBadge status={content.status} />
                    </div>

                    <div className="content-row-text">{content.originalText?.trim() || "Khong co noi dung"}</div>
                  </div>
                </Link>

                <div className="content-row-side" style={{ alignItems: "stretch", gap: 10 }}>
                  <div className="content-row-side-top">
                    <div className="content-row-platform">
                      <FileText aria-hidden size={15} />
                      <span>{content.platform}</span>
                    </div>
                  </div>
                  <div className="content-row-action">{statusLabel[content.status] ?? content.status} · Xem chi tiet</div>

                  {content.status === "failed" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button size="sm" disabled={busyCode === content.code} onClick={() => retryFailed(content)}>Dang lai ngay</Button>
                        <Link to={`/contents/${content.code}`}>
                          <Button size="sm" variant="secondary">Mo chi tiet</Button>
                        </Link>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Input type="datetime-local" value={rescheduleMap[content.code] ?? ""} onChange={(event) => setRescheduleMap((prev) => ({ ...prev, [content.code]: event.target.value }))} />
                        <Button size="sm" variant="secondary" disabled={busyCode === content.code || !rescheduleMap[content.code]} onClick={() => rescheduleFailed(content)}>
                          Hen gio lai
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
