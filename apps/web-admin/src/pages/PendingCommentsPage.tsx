import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { EmptyState } from "../components/common/EmptyState";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

type CommentRow = {
  id: string;
  commentText: string;
  commentMedia: unknown[];
  scheduledAt: string;
  status: string;
  resultUrl: string | null;
  error: string | null;
  attemptNo: number;
  createdAt: string;
  content: {
    id: string;
    code: string;
    originalText: string;
    draftText: string | null;
    finalText: string | null;
  } | null;
  target: { id: string; name: string; platform: string } | null;
};

const statusLabel: Record<string, string> = {
  pending: "Chờ",
  running: "Đang chạy",
  done: "Xong",
  failed: "Lỗi",
  cancelled: "Đã hủy"
};

export function PendingCommentsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [rescheduleMap, setRescheduleMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const q = useQuery<{ comments: CommentRow[]; pagination?: any }>({
    queryKey: ["pending-comments", page, statusFilter],
    queryFn: () => apiGet(`/pending-comments?page=${page}&limit=20${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`)
  });

  const comments = q.data?.comments ?? [];
  const pagination = q.data?.pagination;

  async function retry(id: string) {
    try {
      setBusyId(id);
      await apiPost(`/pending-comments/${id}/retry`);
      await q.refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function reschedule(id: string) {
    const scheduledAt = rescheduleMap[id];
    if (!scheduledAt) return;
    try {
      setBusyId(id);
      await apiPost(`/pending-comments/${id}/reschedule`, { scheduledAt });
      await q.refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    if (!confirm("Hủy comment này?")) return;
    try {
      setBusyId(id);
      await apiDelete(`/pending-comments/${id}`);
      await q.refetch();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Comment chờ xử lý"
        subtitle="Quản lý comment hẹn giờ, xử lý lại comment lỗi."
        actions={<Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => q.refetch()}>Làm mới</Button>}
      />

      <SectionCard title="Bộ lọc" description="">
        <div style={{ display: "flex", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "#6b7280" }}>Trạng thái</label>
            <select
              style={{ fontSize: 13, padding: "5px 8px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 6 }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Pending + lỗi</option>
              <option value="pending">Chờ</option>
              <option value="failed">Lỗi</option>
              <option value="done">Xong</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Comment chờ" description={pagination ? `${pagination.total} mục` : ""}>
        {q.isLoading ? (
          <div className="text-muted" style={{ padding: 16 }}>Đang tải…</div>
        ) : comments.length === 0 ? (
          <EmptyState title="Không có comment nào" description="Comment hẹn giờ hoặc chưa gửi sẽ xuất hiện ở đây." />
        ) : (
          <table className="table table-compact" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Giờ hẹn</th>
                <th>Bài viết</th>
                <th>Tài khoản</th>
                <th>Nội dung</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: 12 }}>{new Date(c.scheduledAt).toLocaleString("vi-VN")}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.content?.code ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{c.target?.name ?? "—"}</td>
                  <td style={{ maxWidth: 200, fontSize: 13 }}>
                    {c.commentText.slice(0, 80)}
                    {c.commentText.length > 80 ? "…" : ""}
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: c.status === "failed" ? "#dc2626" : "#374151" }}>{statusLabel[c.status] ?? c.status}</span>
                    {c.error && <div style={{ fontSize: 11, color: "#dc2626" }}>{c.error.slice(0, 60)}…</div>}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Button disabled={busyId === c.id} onClick={() => retry(c.id)}>Đăng lại</Button>
                        <Button variant="secondary" icon={<Trash2 size={13} />} disabled={busyId === c.id} onClick={() => cancel(c.id)}>Hủy</Button>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Input type="datetime-local" value={rescheduleMap[c.id] ?? ""} onChange={(e) => setRescheduleMap((prev) => ({ ...prev, [c.id]: e.target.value }))} />
                        <Button variant="secondary" disabled={busyId === c.id || !rescheduleMap[c.id]} onClick={() => reschedule(c.id)}>Hẹn lại</Button>
                      </div>
                    </div>
                  </td>
                </tr>
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
