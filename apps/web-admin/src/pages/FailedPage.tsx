import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { EmptyState } from "../components/common/EmptyState";
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

  const preparedRows = useMemo(
    () => items.map((item) => ({ item, latest: item.publishAttempts?.[0] ?? null })),
    [items]
  );

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
        title="Bài đăng lỗi"
        subtitle="Các bài hẹn giờ hoặc đăng ngay bị lỗi sẽ nằm ở đây để xử lý lại."
        actions={<Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => q.refetch()}>Làm mới</Button>}
      />

      <SectionCard title="Danh sách lỗi" description={pagination ? `${pagination.total} bài` : ""}>
        {q.isLoading ? (
          <div className="text-muted" style={{ padding: 16 }}>Đang tải…</div>
        ) : preparedRows.length === 0 ? (
          <EmptyState title="Không có bài lỗi" description="Khi có bài đăng lỗi, bạn có thể xử lý lại tại đây." />
        ) : (
          <table className="table table-compact" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Mã bài</th>
                <th>Lý do lỗi</th>
                <th>Tài khoản đã thử</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {preparedRows.map(({ item, latest }) => {
                const targetIds = [...new Set((item.publishAttempts ?? []).map((attempt) => attempt.targetId))];
                return (
                  <tr key={item.id}>
                    <td>{new Date(item.updatedAt).toLocaleString("vi-VN")}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{item.code}</td>
                    <td style={{ maxWidth: 260, color: "#dc2626", fontSize: 12 }}>{latest?.error ?? "Không có chi tiết"}</td>
                    <td style={{ fontSize: 12 }}>
                      {(item.publishAttempts ?? []).map((attempt) => attempt.target?.name ?? attempt.targetId).join(", ") || "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button disabled={busyCode === item.code} onClick={() => retryNow(item.code, targetIds)}>Đăng lại ngay</Button>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Input type="datetime-local" value={rescheduleMap[item.code] ?? ""} onChange={(e) => setRescheduleMap((prev) => ({ ...prev, [item.code]: e.target.value }))} />
                          <Button variant="secondary" disabled={busyCode === item.code || !rescheduleMap[item.code]} onClick={() => reschedule(item.code)}>Hẹn giờ lại</Button>
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
