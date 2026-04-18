import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderLock, Plus, RefreshCw, ShieldCheck, Trash2, ExternalLink } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { AddAccountDialog } from "../components/accounts/AddAccountDialog";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";

type BrowserLoginSession = {
  sessionId: string;
  accountId: string;
  status: "pending" | "completed" | "cancelled" | "failed";
  sessionDir: string;
  authPath: string;
  browserPid?: number;
  message?: string;
};

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
  const [browserLogin, setBrowserLogin] = useState<BrowserLoginSession | null>(null);

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

  const startBrowserLogin = useMutation({
    mutationFn: (account: Account) => apiPost<BrowserLoginSession>(`/facebook/accounts/${account.id}/browser-login/start`),
    onSuccess: (data) => {
      setBrowserLogin(data);
      setFeedback({ type: "success", message: data.message ?? "Đã mở browser đăng nhập Facebook." });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const completeBrowserLogin = useMutation({
    mutationFn: (sessionId: string) => apiPost<BrowserLoginSession>(`/facebook/browser-login/${sessionId}/complete`),
    onSuccess: (data) => {
      setBrowserLogin(data);
      setFeedback({ type: "success", message: data.message ?? "Đã lưu session Facebook." });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const cancelBrowserLogin = useMutation({
    mutationFn: (sessionId: string) => apiPost<BrowserLoginSession>(`/facebook/browser-login/${sessionId}/cancel`),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Đã huỷ phiên đăng nhập Facebook." });
      setBrowserLogin(null);
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const targetAccounts = (query.data?.accounts ?? []).filter((account) => account.kind === "target");
  const facebookAccounts = targetAccounts.filter((account) => account.platform === "facebook");

  const stats = useMemo(() => {
    return {
      total: targetAccounts.length,
      facebookTargets: facebookAccounts.length,
      healthy: targetAccounts.filter((account) => account.health === "healthy").length,
      active: targetAccounts.filter((account) => account.isActive).length
    };
  }, [facebookAccounts.length, targetAccounts]);

  return (
    <>
      <PageHeader
        title="Tài khoản đăng bài"
        subtitle="Trang này chỉ quản lý tài khoản dùng để publish. Tài khoản nguồn crawl đã được tách sang mục Crawl data."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Đang tải..." : "Làm mới"}
            </Button>
            <Button icon={<Plus aria-hidden />} onClick={() => setDialogOpen(true)}>
              Thêm tài khoản
            </Button>
          </>
        }
      />

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

      <SectionCard
        title="Facebook login/session"
        description="Mở Chromium thật để đăng nhập thủ công rồi lưu session trực tiếp vào account."
        className="mb-4"
      >
        <div className="account-form-header">
          <div>
            <p className="muted-copy">
              Chọn một tài khoản Facebook bên dưới rồi bấm “Mở trình duyệt đăng nhập”. Sau khi login xong, quay lại đây bấm “Hoàn tất lưu session”.
            </p>
            {browserLogin ? (
              <div className="feature-inline-actions" style={{ marginTop: 12 }}>
                <code className="code-inline">{browserLogin.sessionDir}</code>
                <Button
                  variant="secondary"
                  icon={<ShieldCheck aria-hidden />}
                  onClick={() => completeBrowserLogin.mutate(browserLogin.sessionId)}
                  disabled={completeBrowserLogin.isPending || cancelBrowserLogin.isPending}
                >
                  {completeBrowserLogin.isPending ? "Đang lưu..." : "Hoàn tất lưu session"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => cancelBrowserLogin.mutate(browserLogin.sessionId)}
                  disabled={completeBrowserLogin.isPending || cancelBrowserLogin.isPending}
                >
                  Huỷ phiên login
                </Button>
              </div>
            ) : (
              <div className="feature-inline-actions" style={{ marginTop: 12 }}>
                <span className="table-subtle">Chưa có phiên login nào đang mở.</span>
              </div>
            )}
          </div>
          <FolderLock aria-hidden size={18} />
        </div>
      </SectionCard>

      {feedback ? <div className={`banner ${feedback.type}`}>{feedback.message}</div> : null}
      {query.error instanceof Error ? <div className="banner error">{query.error.message}</div> : null}

      <SectionCard padded={false}>
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
                      {account.platform === "facebook" ? (
                        <Button
                          variant="secondary"
                          icon={<ExternalLink aria-hidden />}
                          onClick={() => startBrowserLogin.mutate(account)}
                          disabled={startBrowserLogin.isPending || completeBrowserLogin.isPending || cancelBrowserLogin.isPending}
                        >
                          {startBrowserLogin.isPending ? "Đang mở..." : "Mở trình duyệt đăng nhập"}
                        </Button>
                      ) : null}
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
                  <EmptyState title="Chưa có tài khoản đăng nào" description="Hãy dùng nút “Thêm tài khoản” để tạo tài khoản publish đầu tiên." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>

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
