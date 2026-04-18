import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderLock, Plus, RefreshCw, ShieldCheck, Trash2, ExternalLink } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { AddAccountDialog } from "../components/accounts/AddAccountDialog";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";

type Account = {
  id: string;
  kind: "source" | "target";
  name: string;
  platform: string;
  handle?: string;
  health: string;
  isActive: boolean;
  credentials?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const query = useQuery({ queryKey: ["accounts"], queryFn: () => apiGet<{ accounts: Account[] }>("/accounts") });

  const createTarget = useMutation({
    mutationFn: (values: unknown) => apiPost("/targets", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
      setFeedback({ type: "success", message: "Đã tạo tài khoản đăng mới." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const test = useMutation({
    mutationFn: (account: Account) => apiPost(`/accounts/${account.id}/test`, { kind: account.kind }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setFeedback({ type: "success", message: "Đã gửi yêu cầu test account." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const remove = useMutation({
    mutationFn: (account: Account) => apiDelete(`/targets/${account.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
      setFeedback({ type: "success", message: "Đã xoá tài khoản đăng." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const targetAccounts = (query.data?.accounts ?? []).filter((account) => account.kind === "target");

  const stats = useMemo(() => {
    return {
      total: targetAccounts.length,
      facebookTargets: targetAccounts.filter((account) => account.platform === "facebook").length,
      healthy: targetAccounts.filter((account) => account.health === "healthy").length,
      active: targetAccounts.filter((account) => account.isActive).length
    };
  }, [targetAccounts]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Tài khoản đăng bài</h1>
          <p className="page-subtitle">Trang này chỉ quản lý tài khoản dùng để publish. Tài khoản nguồn crawl đã được tách sang mục Crawl data.</p>
        </div>
        <div className="actions">
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Đang tải..." : "Làm mới"}
          </Button>
          <Button icon={<Plus aria-hidden />} onClick={() => setDialogOpen(true)}>
            Thêm tài khoản
          </Button>
        </div>
      </header>

      <section className="grid-metrics" style={{ marginBottom: 18 }}>
        <div className="panel metric">
          <p className="metric-label">Tổng tài khoản đăng</p>
          <p className="metric-value">{stats.total}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Facebook</p>
          <p className="metric-value">{stats.facebookTargets}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Healthy</p>
          <p className="metric-value">{stats.healthy}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Đang bật</p>
          <p className="metric-value">{stats.active}</p>
        </div>
      </section>

      <div className="panel panel-pad" style={{ marginBottom: 18 }}>
        <div className="account-form-header">
          <div>
            <h2 style={{ marginTop: 0 }}>Facebook login/session</h2>
            <p className="muted-copy">Hiện tại backend mới hỗ trợ nhập session có sẵn qua <strong>authPath</strong> hoặc <strong>sessionDir</strong>. Chưa có flow mở browser để login trực tiếp từ UI.</p>
          </div>
          <FolderLock aria-hidden size={18} />
        </div>
        <div className="feature-inline-actions" style={{ marginTop: 12 }}>
          <Button variant="secondary" disabled icon={<ExternalLink aria-hidden />}>
            Mở trình duyệt đăng nhập
          </Button>
          <span className="table-subtle">Planned. Khi backend có route tạo Playwright session, nút này sẽ mở flow login thật.</span>
        </div>
      </div>

      {feedback ? <div className={`banner ${feedback.type}`}>{feedback.message}</div> : null}
      {query.error instanceof Error ? <div className="banner error">{query.error.message}</div> : null}

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Nền tảng</th>
              <th>Handle</th>
              <th>Sức khỏe</th>
              <th>Session</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {targetAccounts.map((account) => {
              const sessionHint = (account.credentials?.sessionDir as string) || (account.credentials?.authPath as string) || "Chưa cấu hình";
              return (
                <tr key={`${account.kind}-${account.id}`}>
                  <td>
                    <strong>{account.name}</strong>
                    <div className="table-subtle">{account.isActive ? "Đang bật" : "Đang tắt"}</div>
                  </td>
                  <td>{account.platform}</td>
                  <td>{account.handle || <span className="table-subtle">Chưa có</span>}</td>
                  <td>
                    <StatusBadge status={account.health} />
                  </td>
                  <td>
                    <code className="code-inline">{sessionHint}</code>
                  </td>
                  <td>
                    <div className="actions">
                      <Button variant="secondary" icon={<ShieldCheck aria-hidden />} onClick={() => test.mutate(account)} disabled={test.isPending || remove.isPending}>
                        {test.isPending ? "Đang test..." : "Test"}
                      </Button>
                      <Button
                        variant="danger"
                        icon={<Trash2 aria-hidden />}
                        onClick={() => {
                          if (window.confirm(`Xoá tài khoản ${account.name}? Hành động này không thể hoàn tác.`)) {
                            remove.mutate(account);
                          }
                        }}
                        disabled={remove.isPending || test.isPending}
                      >
                        {remove.isPending ? "Đang xoá..." : "Xoá"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {query.data && targetAccounts.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <p>Chưa có tài khoản đăng nào. Hãy dùng nút “Thêm tài khoản”.</p>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AddAccountDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        sourceMutation={{} as any}
        targetMutation={createTarget as any}
        targetOnly
      />
    </>
  );
}
