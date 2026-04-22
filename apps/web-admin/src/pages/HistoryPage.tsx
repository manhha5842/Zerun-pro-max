import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { apiGet } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";

type AttemptRow = {
  id: string;
  contentId: string;
  targetId: string;
  attemptNo: number;
  status: string;
  resultUrl: string | null;
  error: string | null;
  createdAt: string;
  content: { id: string; code: string; originalText: string } | null;
  target: { id: string; name: string; platform: string } | null;
};

type CommentEntry = {
  id: string;
  commentText: string;
  status: string;
  scheduledAt: string | null;
  resultUrl: string | null;
  error: string | null;
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

function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}...`;
}

function CommentList({ attemptId }: { attemptId: string }) {
  const q = useQuery<{ comments: CommentEntry[] }>({
    queryKey: ["history-comments", attemptId],
    queryFn: () => apiGet(`/history/${attemptId}/comments`)
  });

  if (q.isLoading) return <div className="text-muted" style={{ fontSize: 13, padding: "6px 0" }}>Dang tai...</div>;
  if (q.isError) return <div className="text-muted" style={{ fontSize: 13, padding: "6px 0" }}>Khong tai duoc comment.</div>;

  const comments = q.data?.comments ?? [];
  if (comments.length === 0) return <div className="text-muted" style={{ fontSize: 13, padding: "4px 0" }}>Khong co comment.</div>;

  return (
    <div className="stack-tight" style={{ gap: 6 }}>
      {comments.map((c, idx) => (
        <div key={c.id ?? idx} className="simple-row" style={{ padding: "8px 12px" }}>
          <div className="simple-row-main">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusBadge status={c.status} />
              <span className="text-muted" style={{ fontSize: 12 }}>
                {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString("vi-VN") : "-"}
              </span>
              {c.resultUrl && (
                <a href={c.resultUrl} target="_blank" rel="noreferrer" className="text-muted" style={{ fontSize: 12 }}>xem</a>
              )}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{c.commentText}</div>
            {c.error && <div style={{ color: "var(--color-danger)", fontSize: 12, marginTop: 2 }}>Loi: {c.error}</div>}
          </div>
        </div>
      ))}
    </div>
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
        title="Lich su dang bai"
        subtitle="Xem toan bo lan dang va comment kem theo."
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => q.refetch()}>Lam moi</Button>}
      />

      <SectionCard title="Bo loc" description="">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field">
            <label className="form-label">Trang thai</label>
            <select className="form-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="all">Tat ca</option>
              <option value="success">Thanh cong</option>
              <option value="failed">Loi</option>
              <option value="running">Dang chay</option>
            </select>
          </div>
          <div className="field">
            <label className="form-label">Nen tang</label>
            <select className="form-select" value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}>
              <option value="all">Tat ca</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="threads">Threads</option>
              <option value="x">X / Twitter</option>
              <option value="zalo-bot">Zalo Bot</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Lich su" description={pagination ? `${pagination.total} lan dang` : ""}>
        {q.isLoading ? (
          <div className="text-muted" style={{ padding: 16 }}>Dang tai...</div>
        ) : attempts.length === 0 ? (
          <EmptyState title="Chua co lich su" description="Cac lan dang bai se hien tai day sau khi he thong chay." />
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Thoi gian</th>
                <th>Ma bai</th>
                <th>Tai khoan</th>
                <th>Nen tang</th>
                <th>Trang thai</th>
                <th>Link / Loi</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <>
                  <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => toggleExpand(a.id)}>
                    <td style={{ color: "#9ca3af", paddingRight: 4 }}>
                      {expanded.has(a.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(a.createdAt).toLocaleString("vi-VN")}</td>
                    <td><code className="code-inline">{a.content?.code ?? "-"}</code></td>
                    <td style={{ fontSize: 13 }}>{a.target?.name ?? "-"}</td>
                    <td>
                      {a.target?.platform ? <span className="table-tag">{platformLabel[a.target.platform] ?? a.target.platform}</span> : <span className="text-muted">-</span>}
                    </td>
                    <td><StatusBadge status={a.status} /></td>
                    <td style={{ maxWidth: 220, fontSize: 12 }}>
                      {a.resultUrl ? (
                        <a href={a.resultUrl} target="_blank" rel="noreferrer">Xem bai</a>
                      ) : a.error ? (
                        <span style={{ color: "var(--color-danger)" }}>{truncate(a.error, 60)}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                  {expanded.has(a.id) && (
                    <tr key={`${a.id}-comments`}>
                      <td />
                      <td colSpan={6} style={{ background: "var(--color-bg, #f9fafb)", padding: "10px 14px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-soft)", marginBottom: 8 }}>Comment</div>
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
