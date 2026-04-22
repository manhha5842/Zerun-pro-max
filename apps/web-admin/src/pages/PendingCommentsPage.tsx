import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";
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

const platformLabel: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  x: "X / Twitter",
  "zalo-bot": "Zalo Bot",
  "zalo-web": "Zalo Web"
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
    if (!confirm("Huy comment nay?")) return;
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
        title="Comment cho xu ly"
        subtitle="Quan ly comment hen gio, xu ly lai comment loi."
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => q.refetch()}>Lam moi</Button>}
      />

      <SectionCard title="Bo loc" description="">
        <div style={{ display: "flex", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--color-text-muted)" }}>Trang thai</label>
            <select
              style={{ fontSize: 13, padding: "5px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "#fff" }}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="all">Pending + Loi</option>
              <option value="pending">Cho</option>
              <option value="failed">Loi</option>
              <option value="done">Xong</option>
              <option value="cancelled">Da huy</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Comment cho" description={pagination ? `${pagination.total} muc` : ""}>
        {q.isLoading ? (
          <div className="text-muted" style={{ padding: 16 }}>Dang tai...</div>
        ) : comments.length === 0 ? (
          <EmptyState title="Khong co comment nao" description="Comment hen gio hoac chua gui se xuat hien o day." />
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Gio hen</th>
                <th>Bai viet</th>
                <th>Tai khoan</th>
                <th>Noi dung</th>
                <th>Trang thai</th>
                <th>Thao tac</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(c.scheduledAt).toLocaleString("vi-VN")}</td>
                  <td><code className="code-inline">{c.content?.code ?? "-"}</code></td>
                  <td>
                    <div style={{ fontSize: 13 }}>{c.target?.name ?? "-"}</div>
                    {c.target?.platform && <div><span className="table-tag">{platformLabel[c.target.platform] ?? c.target.platform}</span></div>}
                  </td>
                  <td style={{ maxWidth: 200, fontSize: 13 }}>{c.commentText.length > 80 ? `${c.commentText.slice(0, 80)}...` : c.commentText}</td>
                  <td>
                    <div className="stack-tight" style={{ gap: 4 }}>
                      <StatusBadge status={c.status} />
                      {c.error && <div style={{ fontSize: 11, color: "var(--color-danger)" }}>{c.error.slice(0, 60)}...</div>}
                    </div>
                  </td>
                  <td>
                    <div className="stack-tight" style={{ minWidth: 220 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Button size="sm" disabled={busyId === c.id} onClick={() => retry(c.id)}>Dang lai</Button>
                        <Button size="sm" variant="danger" icon={<Trash2 size={12} />} disabled={busyId === c.id} onClick={() => cancel(c.id)}>Huy</Button>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Input type="datetime-local" value={rescheduleMap[c.id] ?? ""} onChange={(e) => setRescheduleMap((prev) => ({ ...prev, [c.id]: e.target.value }))} />
                        <Button size="sm" variant="secondary" disabled={busyId === c.id || !rescheduleMap[c.id]} onClick={() => reschedule(c.id)}>Hen lai</Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Trang truoc</Button>
            <span className="text-muted" style={{ fontSize: 13 }}>Trang {page} / {pagination.totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Trang sau</Button>
          </div>
        )}
      </SectionCard>
    </>
  );
}
