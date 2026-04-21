import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FolderLock,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { AddAccountDialog } from "../components/accounts/AddAccountDialog";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

type BrowserLoginPlatform = "facebook" | "instagram" | "threads";

type BrowserLoginSession = {
  sessionId?: string;
  platform?: BrowserLoginPlatform;
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
      return "Cần xác minh";
    case "login_required":
      return "Chưa đăng nhập";
    default:
      return "Chưa rõ";
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
  const activePlatform = browserLogin?.platform ?? "facebook";

  const query = useQuery({ queryKey: ["accounts"], queryFn: () => apiGet<{ accounts: Account[] }>("/accounts") });

  const browserLoginQuery = useQuery({
    queryKey: ["browser-login", activePlatform, browserLogin?.sessionId],
    queryFn: () => apiGet<BrowserLoginSession>(`/${activePlatform}/browser-login/${browserLogin?.sessionId}`),
    enabled: Boolean(browserLogin?.sessionId),
    refetchInterval: (state) => {
      const data = state.state.data;
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
      setFeedback({ type: "success", message: "Đã thêm tài khoản đăng." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const test = useMutation({
    mutationFn: (account: Account) => apiPost(`/accounts/${account.id}/test`, { kind: account.kind }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setFeedback({ type: "success", message: "Đã gửi yêu cầu kiểm tra tài khoản." });
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
    mutationFn: (account: Account) => apiPost<BrowserLoginSession>(`/${account.platform}/accounts/${account.id}/browser-login/start`),
    onSuccess: (data) => {
      setBrowserLogin(data);
      setFeedback({ type: "success", message: data.message ?? "Đã mở trình duyệt để đăng nhập." });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const completeBrowserLogin = useMutation({
    mutationFn: ({ platform, sessionId }: { platform: string; sessionId: string }) => apiPost<BrowserLoginSession>(`/${platform}/browser-login/${sessionId}/complete`),
    onSuccess: (data) => {
      setBrowserLogin(data);
      setFeedback({ type: "success", message: data.message ?? "Đã lưu session." });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const cancelBrowserLogin = useMutation({
    mutationFn: ({ platform, sessionId }: { platform: string; sessionId: string }) => apiPost<BrowserLoginSession>(`/${platform}/browser-login/${sessionId}/cancel`),
    onSuccess: (data) => {
      setFeedback({ type: "success", message: "Đã huỷ phiên đăng nhập." });
      setBrowserLogin(data);
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const checkBrowserSession = useMutation({
    mutationFn: ({ accountId, platform }: { accountId: string; platform: BrowserLoginPlatform }) =>
      apiPost<{ health: BrowserLoginSession["health"] }>(`/accounts/${accountId}/${platform}-session/check`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      const label = variables.platform === "facebook" ? "Facebook" : variables.platform === "instagram" ? "Instagram" : "Threads";
      setFeedback({ type: "success", message: `Đã kiểm tra session ${label}.` });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const targetAccounts = (query.data?.accounts ?? []).filter((account) => account.kind === "target");
  const browserAccounts = targetAccounts.filter((account) => ["facebook", "instagram", "threads"].includes(account.platform));

  const stats = useMemo(() => {
    const needsAttention = browserAccounts.filter((account) => {
      const authState = account.sessionState?.authState ?? account.sessionState?.health?.authState;
      return authState && authState !== "authenticated";
    }).length;

    return {
      total: targetAccounts.length,
      browser: browserAccounts.length,
      healthy: targetAccounts.filter((account) => account.health === "healthy").length,
      needsAttention
    };
  }, [browserAccounts, targetAccounts]);

  return (
    <>
      <PageHeader
        title="Tài khoản đăng"
        subtitle="Chỉ quản lý các tài khoản dùng để đăng bài. Tài khoản nguồn đã tách sang Crawl data."
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
          <p className="metric-label">Tổng tài khoản</p>
          <p className="metric-value">{stats.total}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Có browser session</p>
          <p className="metric-value">{stats.browser}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Đang ổn</p>
          <p className="metric-value">{stats.healthy}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Cần xử lý session</p>
          <p className="metric-value">{stats.needsAttention}</p>
        </div>
      </section>

      <SectionCard
        title="Browser session"
        description="Mở trình duyệt để đăng nhập thủ công cho Facebook, Instagram hoặc Threads rồi lưu lại session."
        className="mb-4"
      >
        <div className="account-form-header">
          <div>
            <p className="muted-copy">Phiên đang mở sẽ hiện tại đây. Trạng thái đã lưu vẫn hiển thị trực tiếp trong bảng tài khoản bên dưới.</p>

            {activeBrowserLogin ? (
              <div className="stack-tight" style={{ marginTop: 12 }}>
                <div className="feature-inline-actions">
                  <Badge tone={getSessionStatusTone(activeBrowserLogin.status)}>{activeBrowserLogin.status}</Badge>
                  <Badge tone={getAuthTone(activeBrowserLogin.authState)}>{getAuthLabel(activeBrowserLogin.authState)}</Badge>
                  {activeBrowserLogin.browserOpen ? (
                    <span className="table-subtle" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Clock3 size={14} aria-hidden /> Trình duyệt đang mở
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
                      onClick={() => completeBrowserLogin.mutate({ platform: activeBrowserLogin.platform ?? "facebook", sessionId: activeBrowserLogin.sessionId! })}
                      disabled={completeBrowserLogin.isPending || cancelBrowserLogin.isPending || activeBrowserLogin.status !== "pending"}
                    >
                      {completeBrowserLogin.isPending ? "Đang lưu..." : "Lưu session"}
                    </Button>
                  ) : null}
                  {activeBrowserLogin.sessionId ? (
                    <Button
                      variant="ghost"
                      icon={<RotateCcw aria-hidden />}
                      onClick={() => cancelBrowserLogin.mutate({ platform: activeBrowserLogin.platform ?? "facebook", sessionId: activeBrowserLogin.sessionId! })}
                      disabled={completeBrowserLogin.isPending || cancelBrowserLogin.isPending || activeBrowserLogin.status !== "pending"}
                    >
                      Huỷ phiên
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
              <div className="table-subtle" style={{ marginTop: 10 }}>Chưa có phiên đăng nhập nào đang mở.</div>
            )}
          </div>
          <FolderLock aria-hidden size={18} />
        </div>
      </SectionCard>

      {feedback ? <div className={`banner ${feedback.type}`}>{feedback.message}</div> : null}
      {query.error instanceof Error ? <div className="banner error">{query.error.message}</div> : null}

      <SectionCard title="Danh sách tài khoản" description="Tập trung vào trạng thái session, tình trạng hoạt động và thao tác nhanh." padded={false}>
        <table className="table table-compact">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Nền tảng</th>
              <th>Handle</th>
              <th>Trạng thái</th>
              <th>Session</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {targetAccounts.map((account) => {
              const persistedSession = account.sessionState;
              const sessionHint =
                (account.credentials?.sessionDir as string) ||
                (account.credentials?.authPath as string) ||
                persistedSession?.sessionDir ||
                persistedSession?.authPath ||
                "Chưa cấu hình";
              const authState = persistedSession?.authState ?? persistedSession?.health?.authState;
              const sessionStatus = persistedSession?.status ?? persistedSession?.health?.status;
              const sessionMessage = persistedSession?.health?.message ?? persistedSession?.lastError;
              const isCurrentBrowserLogin = activeBrowserLogin?.accountId === account.id;

              return (
                <tr key={`${account.kind}-${account.id}`}>
                  <td>
                    <strong>{account.name}</strong>
                    <div className="table-subtle">{account.isActive ? "Đang bật" : "Đang tắt"}</div>
                    {["facebook", "instagram", "threads"].includes(account.platform) ? (
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
                    <StatusBadge status={sessionStatus ? String(sessionStatus) : account.health} />
                  </td>
                  <td>
                    <code className="code-inline">{sessionHint}</code>
                    {persistedSession?.lastCheckedAt ? <div className="table-subtle" style={{ marginTop: 6 }}>Kiểm tra gần nhất: {new Date(persistedSession.lastCheckedAt).toLocaleString("vi-VN")}</div> : null}
                    {sessionMessage ? <div className="table-subtle" style={{ marginTop: 6 }}>{sessionMessage}</div> : null}
                  </td>
                  <td>
                    <div className="actions actions-tight">
                      {["facebook", "instagram", "threads"].includes(account.platform) ? (
                        <>
                          <Button
                            variant="secondary"
                            icon={<ExternalLink aria-hidden />}
                            onClick={() => startBrowserLogin.mutate(account)}
                            disabled={startBrowserLogin.isPending || completeBrowserLogin.isPending || cancelBrowserLogin.isPending}
                          >
                            {persistedSession?.authPath ? "Mở lại session" : startBrowserLogin.isPending ? "Đang mở..." : "Mở đăng nhập"}
                          </Button>
                          <Button
                            variant="ghost"
                            icon={<Search aria-hidden />}
                            onClick={() => checkBrowserSession.mutate({ accountId: account.id, platform: account.platform as BrowserLoginPlatform })}
                            disabled={checkBrowserSession.isPending || startBrowserLogin.isPending}
                          >
                            {checkBrowserSession.isPending ? "Đang kiểm tra..." : "Kiểm tra session"}
                          </Button>
                        </>
                      ) : null}

                      <Button variant="secondary" icon={<ShieldCheck aria-hidden />} onClick={() => test.mutate(account)} disabled={test.isPending || remove.isPending}>
                        {test.isPending ? "Đang kiểm tra..." : "Kiểm tra"}
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
                  <EmptyState title="Chưa có tài khoản đăng" description="Dùng nút Thêm tài khoản để tạo tài khoản đăng đầu tiên." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>

      <AddAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} sourceMutation={{} as any} targetMutation={createTarget as any} targetOnly />
    </>
  );
}
