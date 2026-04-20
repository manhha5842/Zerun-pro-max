import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderLock, Plus, RefreshCw, ShieldCheck, Trash2, ExternalLink, CheckCircle2, AlertTriangle, Clock3, RotateCcw, Search } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { AddAccountDialog } from "../components/accounts/AddAccountDialog";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

type BrowserLoginSession = {
  sessionId?: string;
  accountId: string;
  status: "pending" | "completed" | "cancelled" | "failed" | "healthy" | "degraded" | "checkpoint" | "missing" | "unknown";
  sessionDir?: string;
  authPath?: string;
  browserPid?: number;
  message?: string;
  authDetected?: boolean;
  authState?: "unknown" | "authenticated" | "login_required" | "checkpoint";
  currentUrl?: string;
  cookieNames?: string[];
  browserOpen?: boolean;
  lastCheckedAt?: string;
  createdAt?: string;
  lastError?: string;
  health?: {
    status: string;
    authState: "unknown" | "authenticated" | "login_required" | "checkpoint";
    authPath?: string;
    sessionDir?: string;
    hasSessionFile: boolean;
    checkedAt: string;
    message?: string;
  };
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
  sessionState?: BrowserLoginSession | null;
};

function getAuthTone(state?: BrowserLoginSession["authState"]) {
  switch (state) {
    case "authenticated":
      return "good" as const;
    case "checkpoint":
      return "danger" as const;
    case "login_required":
      return "warn" as const;
    default:
      return "neutral" as const;
  }
}

function getAuthLabel(state?: BrowserLoginSession["authState"]) {
  switch (state) {
    case "authenticated":
      return "Đã đăng nhập";
    case "checkpoint":
      return "Checkpoint / xác minh";
    case "login_required":
      return "Chưa đăng nhập";
    default:
      return "Chưa xác định";
  }
}

function getSessionStatusTone(status?: BrowserLoginSession["status"]) {
  switch (status) {
    case "completed":
    case "healthy":
      return "good" as const;
    case "checkpoint":
    case "failed":
      return "danger" as const;
    case "cancelled":
    case "missing":
    case "degraded":
      return "warn" as const;
    default:
      return "neutral" as const;
  }
}

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [browserLogin, setBrowserLogin] = useState<BrowserLoginSession | null>(null);

  const query = useQuery({ queryKey: ["accounts"], queryFn: () => apiGet<{ accounts: Account[] }>("/accounts") });

  const browserLoginQuery = useQuery({
    queryKey: ["facebook-browser-login", browserLogin?.sessionId],
    queryFn: () => apiGet<BrowserLoginSession>(`/facebook/browser-login/${browserLogin?.sessionId}`),
    enabled: Boolean(browserLogin?.sessionId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      return data.status === "pending" ? 3000 : false;
    }
  });

  const activeBrowserLogin = browserLoginQuery.data ?? browserLogin;

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
      if (data.sessionId) void queryClient.invalidateQueries({ queryKey: ["facebook-browser-login", data.sessionId] });
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
      if (data.sessionId) void queryClient.invalidateQueries({ queryKey: ["facebook-browser-login", data.sessionId] });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const cancelBrowserLogin = useMutation({
    mutationFn: (sessionId: string) => apiPost<BrowserLoginSession>(`/facebook/browser-login/${sessionId}/cancel`),
    onSuccess: (data) => {
      setFeedback({ type: "success", message: "Đã huỷ phiên đăng nhập Facebook." });
      setBrowserLogin(data);
      if (data.sessionId) void queryClient.invalidateQueries({ queryKey: ["facebook-browser-login", data.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const checkFacebookSession = useMutation({
    mutationFn: (accountId: string) => apiPost<{ health: BrowserLoginSession["health"] }>(`/accounts/${accountId}/facebook-session/check`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setFeedback({ type: "success", message: "Đã kiểm tra session Facebook." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const targetAccounts = (query.data?.accounts ?? []).filter((account) => account.kind === "target");
  const facebookAccounts = targetAccounts.filter((account) => account.platform === "facebook");

  const stats = useMemo(() => {
    const unhealthyFacebook = facebookAccounts.filter((account) => {
      const authState = account.sessionState?.authState ?? account.sessionState?.health?.authState;
      return authState && authState !== "authenticated";
    }).length;

    return {
      total: targetAccounts.length,
      facebookTargets: facebookAccounts.length,
      healthy: targetAccounts.filter((account) => account.health === "healthy").length,
      active: targetAccounts.filter((account) => account.isActive).length,
      unhealthyFacebook
    };
  }, [facebookAccounts, targetAccounts]);

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
          <p className="metric-label">Session FB cần chú ý</p>
          <p className="metric-value">{stats.unhealthyFacebook}</p>
        </div>
      </section>

      <SectionCard
        title="Facebook login/session"
        description="Trạng thái session được lưu theo account ở backend, nên reload trang vẫn xem lại được badge và health gần nhất."
        className="mb-4"
      >
        <div className="account-form-header">
          <div>
            <p className="muted-copy">
              Bạn có thể mở browser login mới, mở lại browser session cho account, hoặc bấm kiểm tra session để biết account Facebook còn đăng nhập hay đã hết session.
            </p>
            {activeBrowserLogin ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                <div className="feature-inline-actions">
                  <Badge tone={getSessionStatusTone(activeBrowserLogin.status)}>{activeBrowserLogin.status}</Badge>
                  <Badge tone={getAuthTone(activeBrowserLogin.authState)}>{getAuthLabel(activeBrowserLogin.authState)}</Badge>
                  {activeBrowserLogin.browserOpen ? (
                    <span className="table-subtle" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Clock3 size={14} aria-hidden /> Browser đang mở
                    </span>
                  ) : null}
                  {activeBrowserLogin.authDetected ? (
                    <span className="table-subtle" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <CheckCircle2 size={14} aria-hidden /> Đã phát hiện cookie đăng nhập
                    </span>
                  ) : null}
                </div>

                {activeBrowserLogin.sessionDir ? <code className="code-inline">{activeBrowserLogin.sessionDir}</code> : null}

                <div className="feature-inline-actions">
                  {activeBrowserLogin.sessionId ? (
                    <Button
                      variant="secondary"
                      icon={<ShieldCheck aria-hidden />}
                      onClick={() => completeBrowserLogin.mutate(activeBrowserLogin.sessionId!)}
                      disabled={
                        completeBrowserLogin.isPending ||
                        cancelBrowserLogin.isPending ||
                        activeBrowserLogin.status !== "pending"
                      }
                    >
                      {completeBrowserLogin.isPending ? "Đang lưu..." : "Đã xong, lưu session"}
                    </Button>
                  ) : null}
                  {activeBrowserLogin.sessionId ? (
                    <Button
                      variant="ghost"
                      onClick={() => cancelBrowserLogin.mutate(activeBrowserLogin.sessionId!)}
                      disabled={completeBrowserLogin.isPending || cancelBrowserLogin.isPending || activeBrowserLogin.status !== "pending"}
                    >
                      Huỷ phiên login
                    </Button>
                  ) : null}
                </div>

                {activeBrowserLogin.currentUrl ? <div className="table-subtle">URL hiện tại: {activeBrowserLogin.currentUrl}</div> : null}
                {activeBrowserLogin.lastCheckedAt ? <div className="table-subtle">Kiểm tra gần nhất: {new Date(activeBrowserLogin.lastCheckedAt).toLocaleString("vi-VN")}</div> : null}
                {activeBrowserLogin.lastError ? (
                  <div className="table-subtle" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={14} aria-hidden /> {activeBrowserLogin.lastError}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="feature-inline-actions" style={{ marginTop: 12 }}>
                <span className="table-subtle">Chưa có phiên login nào đang mở. Trạng thái đã lưu vẫn hiện trực tiếp ở bảng account bên dưới.</span>
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
              const sessionHint = (account.credentials?.sessionDir as string) || (account.credentials?.authPath as string) || account.sessionState?.sessionDir || account.sessionState?.authPath || "Chưa cấu hình";
              const isCurrentBrowserLogin = activeBrowserLogin?.accountId === account.id;
              const persistedSession = account.sessionState;
              const authState = persistedSession?.authState ?? persistedSession?.health?.authState;
              const sessionStatus = persistedSession?.status ?? persistedSession?.health?.status;
              const sessionMessage = persistedSession?.health?.message ?? persistedSession?.lastError;

              return (
                <tr key={`${account.kind}-${account.id}`}>
                  <td>
                    <strong>{account.name}</strong>
                    <div className="table-subtle">{account.isActive ? "Đang bật" : "Đang tắt"}</div>
                    {account.platform === "facebook" ? (
                      <div className="feature-inline-actions" style={{ marginTop: 8 }}>
                        {sessionStatus ? <Badge tone={getSessionStatusTone(sessionStatus as BrowserLoginSession["status"])}>Session: {sessionStatus}</Badge> : null}
                        <Badge tone={getAuthTone(authState)}>{getAuthLabel(authState)}</Badge>
                        {isCurrentBrowserLogin && activeBrowserLogin ? <Badge tone={getSessionStatusTone(activeBrowserLogin.status)}>Đang thao tác</Badge> : null}
                      </div>
                    ) : null}
                  </td>
                  <td>{account.platform}</td>
                  <td>{account.handle || <span className="table-subtle">Chưa có</span>}</td>
                  <td>
                    <StatusBadge status={account.platform === "facebook" && sessionStatus ? String(sessionStatus) : account.health} />
                  </td>
                  <td>
                    <code className="code-inline">{sessionHint}</code>
                    {account.platform === "facebook" && persistedSession?.lastCheckedAt ? (
                      <div className="table-subtle" style={{ marginTop: 6 }}>
                        Check gần nhất: {new Date(persistedSession.lastCheckedAt).toLocaleString("vi-VN")}
                      </div>
                    ) : null}
                    {account.platform === "facebook" && sessionMessage ? (
                      <div className="table-subtle" style={{ marginTop: 6 }}>{sessionMessage}</div>
                    ) : null}
                  </td>
                  <td>
                    <div className="actions">
                      {account.platform === "facebook" ? (
                        <>
                          <Button
                            variant="secondary"
                            icon={<ExternalLink aria-hidden />}
                            onClick={() => startBrowserLogin.mutate(account)}
                            disabled={startBrowserLogin.isPending || completeBrowserLogin.isPending || cancelBrowserLogin.isPending}
                          >
                            {persistedSession?.authPath ? "Mở lại browser session" : startBrowserLogin.isPending ? "Đang mở..." : "Mở trình duyệt đăng nhập"}
                          </Button>
                          <Button
                            variant="ghost"
                            icon={<Search aria-hidden />}
                            onClick={() => checkFacebookSession.mutate(account.id)}
                            disabled={checkFacebookSession.isPending || startBrowserLogin.isPending}
                          >
                            {checkFacebookSession.isPending ? "Đang kiểm tra..." : "Kiểm tra session"}
                          </Button>
                        </>
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
