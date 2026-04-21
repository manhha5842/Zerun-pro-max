import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, RefreshCw } from "lucide-react";
import { apiGet } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { EmptyState } from "../components/common/EmptyState";
import { Button } from "../components/ui/Button";
import type { ApiResult } from "../api/client";

type AttemptRow = {
  id: string;
  contentId: string;
  targetId: string;
  attemptNo: number;
  status: string;
  resultUrl: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  content: {
    id: string;
    code: string;
    originalText: string;
    draftText: string | null;
    finalText: string | null;
    metadata: Record<string, unknown> | null;
  } | null;
  target: { id: string; name: string; platform: string } | null;
};

type CommentEntry = {
  id: string;
  commentText: string;
  commentMedia: unknown[];
  status: string;
  scheduledAt: string | null;
  resultUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const platformLabel: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  x: "X / Twitter",
  "zalo-bot": "Zalo Bot",
  "zalo-web": "Zalo Web",
  telegram: "Telegram"
};

const statusConfig: Record<string, { label: string; color: string }> = {
  success: { label: "Thành công", color: "#16a34a" },
  failed: { label: "Lỗi", color: "#dc2626" },
  running: { label: "Đang chạy", color: "#d97706" },
  pending: { label: "Chờ", color: "#6b7280" }
};

function truncate(text: string, max = 80): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + "…";
}

function RelativeTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <time dateTime={iso} title={d.toLocaleString("vi-VN")}>
      {d.toLocaleString("vi-VN")}
    </time>
  );
}

function CommentList({ attemptId }: { attemptId: string }) {
  const q = useQuery<{ comments: CommentEntry[] }>({
    queryKey: ["history-comments", attemptId],
    queryFn: () => apiGet(`/history/${attemptId}/comments`)
  });

  if (q.isLoading) return <div className="text-muted" style={{ fontSize: 13, padding: "6px 0" }}>Đang tải…</div>;
  if (q.isError) return <div className="text-muted" style={{ fontSize: 13, padding: "6px 0" }}>Không tải được comment.</div>;

  const comments = q.data?.comments ?? [];
  if (comments.length === 0) return <div className="text-muted" style={{ fontSize: 13, padding: "6px 0" }}>Không có comment nào.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {comments.map((c, idx) => (
        <div key={c.id ?? idx} style={{ background: "var(--surface-raised, #f8f9fa)", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <StatusDot status={c.status} />
            <span className="text-muted" style={{ fontSize: 12 }}>
              {c.scheduledAt ? <RelativeTime iso={c.scheduledAt} /> : "—"}
            </span>
            {c.resultUrl && (
              <a href={c.resultUrl} target="_blank" rel="noreferrer" className="text-muted" style={{ fontSize: 12 }}>xem</a>
            )}
          </div>
          <div>{c.commentText}</div>
          {c.error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>Lỗi: {c.error}</div>}
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cfg = statusConfig[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: cfg?.color ?? "#6b7280" }}>
      {status === "success" ? <CheckCircle2 size={13} /> : status === "failed" ? <AlertCircle size={13} /> : <Clock size={13} />}
      {cfg?.label ?? status}
    </span>
  );
}

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const q = useQuery<{ attempts: AttemptRow[]; pagination?: any }>({
    queryKey: ["history", page, statusFilter, platformFilter],
    queryFn: () =>
      apiGet(`/history?page=${page}&limit=20${statusFilter !== "all" ? `&status=${statusFilter}` : ""}${platformFilter !== "all" ? `&platform=${platformFilter}` : ""}`)
  });

  const attempts = q.data?.attempts ?? [];
  const pagination = q.data?.pagination;

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Lịch sử đăng bài"
        subtitle="Xem toàn bộ lần đăng bài và comment kèm theo."
        actions={
          <div className="actions">
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => q.refetch()}>Làm mới</Button>
          </div>
        }
      />

      <SectionCard title="Bộ lọc" description="">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div>
            <label className="form-label">Trạng thái</label>
            <select className="form-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="all">Tất cả</option>
              <option value="success">Thành công</option>
              <option value="failed">Lỗi</option>
              <option value="running">Đang chạy</option>
            </select>
          </div>
          <div>
            <label className="form-label">Nền tảng</label>
            <select className="form-select" value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}>
              <option value="all">Tất cả</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="threads">Threads</option>
              <option value="x">X / Twitter</option>
              <option value="zalo-bot">Zalo Bot</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Lịch sử"
        description={pagination ? `${pagination.total} lần đăng` : ""}
      >
        {q.isLoading ? (
          <div className="text-muted" style={{ padding: 16 }}>Đang tải…</div>
        ) : attempts.length === 0 ? (
          <EmptyState title="Chưa có lịch sử" description="Các lần đăng bài sẽ hiện tại đây sau khi hệ thống chạy." />
        ) : (
          <table className="table table-compact" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Thời gian</th>
                <th>Mã bài</th>
                <th>Tài khoản</th>
                <th>Nền tảng</th>
                <th>Trạng thái</th>
                <th>Link / Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <>
                  <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => toggleExpand(a.id)}>
                    <td style={{ textAlign: "center", color: "#9ca3af" }}>
                      {expanded.has(a.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td><RelativeTime iso={a.createdAt} /></td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{a.content?.code ?? "—"}</td>
                    <td>{a.target?.name ?? "—"}</td>
                    <td>{platformLabel[a.target?.platform ?? ""] ?? (a.target?.platform ?? "—")}</td>
                    <td><StatusDot status={a.status} /></td>
                    <td style={{ maxWidth: 220 }}>
                      {a.resultUrl ? (
                        <a href={a.resultUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Xem bài</a>
                      ) : a.error ? (
                        <span style={{ color: "#dc2626", fontSize: 12 }}>{truncate(a.error, 60)}</span>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                  {expanded.has(a.id) && (
                    <tr key={`${a.id}-expand`}>
                      <td />
                      <td colSpan={6} style={{ background: "var(--surface, #f9fafb)", padding: "8px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Comment</div>
                        <CommentList attemptId={a.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Trang trước</Button>
            <span className="text-muted" style={{ fontSize: 13 }}>Trang {page} / {pagination.totalPages}</span>
            <Button variant="secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Trang sau</Button>
          </div>
        )}
      </SectionCard>
    </>
  );
}
