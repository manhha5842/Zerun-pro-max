import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

type FailedContent = {
  id: string;
  code: string;
  status: string;
  updatedAt: string;
  scheduledTargets: string[] | null;
  publishAttempts: Array<{
    id: string;
    targetId: string;
    error: string | null;
    createdAt: string;
    status: string;
    target: { id: string; name: string; platform: string } | null;
  }>;
};

export function FailedPage() {
  const [page, setPage] = useState(1);
  const [rescheduleMap, setRescheduleMap] = useState<Record<string, string>>({});
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const q = useQuery<{ contents: FailedContent[]; pagination?: any }>({
    queryKey: ["failed-posts", page],
    queryFn: () => apiGet(`/failed?page=${page}&limit=20`)
  });

  const items = q.data?.contents ?? [];
  const pagination = q.data?.pagination;

  const preparedRows = useMemo(() => items.map((item) => ({ item, latest: item.publishAttempts?.[0] ?? null })), [items]);

  async function retryNow(code: string, targetIds: string[]) {
    try {
      setBusyCode(code);
      await apiPost(`/failed/${code}/retry`, { targetIds });
      await q.refetch();
    } finally {
      setBusyCode(null);
    }
  }

  async function reschedule(code: string) {
    const scheduledAt = rescheduleMap[code];
    if (!scheduledAt) return;
    try {
      setBusyCode(code);
      await apiPost(`/failed/${code}/reschedule`, { scheduledAt });
      await q.refetch();
    } finally {
      setBusyCode(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Bai dang loi"
        subtitle="Cac bai hen gio hoac dang ngay bi loi se nam o day de xu ly lai."
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => q.refetch()}>Lam moi</Button>}
      />

      <SectionCard title="Danh sach loi" description={pagination ? `${pagination.total} bai` : ""}>
        {q.isLoading ? (
          <div className="text-muted" style={{ padding: 16 }}>Dang tai...</div>
        ) : preparedRows.length === 0 ? (
          <EmptyState title="Khong co bai loi" description="Khi co bai dang loi, ban co the xu ly lai tai day." />
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Thoi gian</th>
                <th>Ma bai</th>
                <th>Trang thai</th>
                <th>Ly do loi</th>
                <th>Tai khoan da thu</th>
                <th>Thao tac</th>
              </tr>
            </thead>
            <tbody>
              {preparedRows.map(({ item, latest }) => {
                const targetIds = [...new Set((item.publishAttempts ?? []).map((attempt) => attempt.targetId))];
                return (
                  <tr key={item.id}>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(item.updatedAt).toLocaleString("vi-VN")}</td>
                    <td><code className="code-inline">{item.code}</code></td>
                    <td><StatusBadge status={item.status} /></td>
                    <td style={{ maxWidth: 240, color: "var(--color-danger)", fontSize: 12 }}>{latest?.error ?? "Khong co chi tiet"}</td>
                    <td style={{ fontSize: 12 }}>{(item.publishAttempts ?? []).map((attempt) => attempt.target?.name ?? attempt.targetId).join(", ") || "-"}</td>
                    <td>
                      <div className="stack-tight" style={{ minWidth: 230 }}>
                        <div className="actions-tight" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Button size="sm" disabled={busyCode === item.code} onClick={() => retryNow(item.code, targetIds)}>Dang lai ngay</Button>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <Input type="datetime-local" value={rescheduleMap[item.code] ?? ""} onChange={(e) => setRescheduleMap((prev) => ({ ...prev, [item.code]: e.target.value }))} />
                          <Button size="sm" variant="secondary" disabled={busyCode === item.code || !rescheduleMap[item.code]} onClick={() => reschedule(item.code)}>Hen gio lai</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
