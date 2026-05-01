import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LogIn, PlayCircle, Plus, RefreshCw, ShieldCheck, Square, Trash2, XCircle } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { AddAccountDialog } from "../components/accounts/AddAccountDialog";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/Toast";

type AccountKind = "source" | "target";
type BrowserLoginPlatform = "facebook" | "instagram" | "threads" | "x";

type BrowserLoginSession = {
  sessionId?: string;
  platform?: BrowserLoginPlatform;
  accountId?: string;
  status?: "pending" | "completed" | "cancelled" | "failed" | string;
  authState?: "unknown" | "authenticated" | "login_required" | "checkpoint";
  authDetected?: boolean;
  browserOpen?: boolean;
  currentUrl?: string;
  lastCheckedAt?: string;
  createdAt?: string;
  lastError?: string;
  message?: string;
  health?: {
    status: string;
    authState?: "unknown" | "authenticated" | "login_required" | "checkpoint";
    checkedAt?: string;
    message?: string;
  };
};

type Account = {
  id: string;
  kind: AccountKind;
  name: string;
  platform: string;
  handle?: string | null;
  health: string;
  isActive: boolean;
  sessionState?: BrowserLoginSession | null;
};

type AccountAction = {
  account: Account;
  value?: boolean;
};

const platformLabels: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  telegram: "Telegram",
  x: "X / Twitter",
  "zalo-bot": "Zalo OA",
  "zalo-web": "Zalo Web"
};

function isBrowserLoginPlatform(platform: string): platform is BrowserLoginPlatform {
  return platform === "facebook" || platform === "instagram" || platform === "threads" || platform === "x";
}

function authStateOf(account: Account) {
  return account.sessionState?.authState ?? account.sessionState?.health?.authState ?? "unknown";
}

function authLabel(state: string) {
  const labels: Record<string, string> = {
    authenticated: "Đã đăng nhập",
    login_required: "Cần đăng nhập",
    checkpoint: "Checkpoint",
    unknown: "Chưa kiểm tra"
  };
  return labels[state] ?? state;
}

function authTone(state: string) {
  if (state === "authenticated") return "good" as const;
  if (state === "checkpoint") return "danger" as const;
  if (state === "login_required") return "warn" as const;
  return "neutral" as const;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("vi-VN");
}

function sessionCheckedAt(account: Account) {
  return account.sessionState?.lastCheckedAt ?? account.sessionState?.health?.checkedAt;
}

function platformLabel(platform: string) {
  return platformLabels[platform] ?? platform;
}

export function AccountsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("all");
  const [health, setHealth] = useState("all");
  const [authState, setAuthState] = useState("all");
  const [active, setActive] = useState("all");
  const [browserLogin, setBrowserLogin] = useState<BrowserLoginSession | null>(null);

  const query = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/accounts")
  });

  const invalidateAccounts = async () => {
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const startBrowserLogin = useMutation({
    mutationFn: (account: Account) => apiPost<BrowserLoginSession>(`/${account.platform}/accounts/${account.id}/browser-login/start`, {}),
    onSuccess: async (data, account) => {
      setBrowserLogin({ ...data, platform: account.platform as BrowserLoginPlatform, accountId: account.id });
      toast.success(data.message ?? "Đã mở trình duyệt đăng nhập.");
      await invalidateAccounts();
    },
    onError: (error) => toast.error(error.message)
  });

  const createTarget = useMutation({
    mutationFn: (values: unknown) => apiPost<{ target: Account }>("/targets", values),
    onSuccess: async (data) => {
      await invalidateAccounts();
      if (data.target && isBrowserLoginPlatform(data.target.platform)) {
        toast.info(`Đã tạo tài khoản ${platformLabel(data.target.platform)}. Đang mở trình duyệt đăng nhập.`);
        startBrowserLogin.mutate(data.target);
        return;
      }
      toast.success("Đã thêm tài khoản.");
    },
    onError: (error) => toast.error(error.message)
  });

  const remove = useMutation({
    mutationFn: (account: Account) => apiDelete(`/targets/${account.id}`),
    onSuccess: async () => {
      toast.success("Đã xóa tài khoản.");
      await invalidateAccounts();
    },
    onError: (error) => toast.error(error.message)
  });

  const toggleActive = useMutation({
    mutationFn: ({ account, value }: AccountAction) => apiPut(`/targets/${account.id}`, { isActive: value }),
    onSuccess: async (_, action) => {
      toast.success(action.value ? "Đã bật tài khoản." : "Đã tắt tài khoản.");
      await invalidateAccounts();
    },
    onError: (error) => toast.error(error.message)
  });

  const test = useMutation({
    mutationFn: (account: Account) => apiPost(`/accounts/${account.id}/test`, { kind: account.kind }),
    onSuccess: async () => {
      toast.success("Đã gửi yêu cầu kiểm tra. Trạng thái sẽ cập nhật sau vài giây.");
      await invalidateAccounts();
      window.setTimeout(() => void invalidateAccounts(), 1800);
      window.setTimeout(() => void invalidateAccounts(), 5000);
    },
    onError: (error) => toast.error(error.message)
  });

  const checkSession = useMutation({
    mutationFn: (account: Account) => apiPost<{ health?: BrowserLoginSession["health"] }>(`/accounts/${account.id}/${account.platform}-session/check`, {}),
    onSuccess: async (data) => {
      toast.success(data.health?.message ?? "Đã kiểm tra session.");
      await invalidateAccounts();
    },
    onError: (error) => toast.error(error.message)
  });

  const refreshBrowserLogin = useMutation({
    mutationFn: (session: BrowserLoginSession) => apiGet<BrowserLoginSession>(`/${session.platform ?? "facebook"}/browser-login/${session.sessionId}`),
    onSuccess: (data, session) => {
      setBrowserLogin({ ...session, ...data });
      toast.success("Đã cập nhật trạng thái phiên đăng nhập.");
    },
    onError: (error) => toast.error(error.message)
  });

  const completeBrowserLogin = useMutation({
    mutationFn: (session: BrowserLoginSession) => apiPost<BrowserLoginSession>(`/${session.platform ?? "facebook"}/browser-login/${session.sessionId}/complete`, {}),
    onSuccess: async (data, session) => {
      setBrowserLogin(null);
      toast.success(data.message ?? "Đã lưu session vào tài khoản.");
      await invalidateAccounts();
    },
    onError: (error) => toast.error(error.message)
  });

  const cancelBrowserLogin = useMutation({
    mutationFn: (session: BrowserLoginSession) => apiPost<BrowserLoginSession>(`/${session.platform ?? "facebook"}/browser-login/${session.sessionId}/cancel`, {}),
    onSuccess: async () => {
      setBrowserLogin(null);
      toast.success("Đã hủy phiên đăng nhập.");
      await invalidateAccounts();
    },
    onError: (error) => toast.error(error.message)
  });

  const accounts = query.data?.accounts ?? [];
  const rows = useMemo(() => {
    return accounts.filter((account) => {
      const text = [account.name, account.handle, account.platform, account.health, authStateOf(account)].join(" ").toLowerCase();
      if (account.kind !== "target") return false;
      if (keyword.trim() && !text.includes(keyword.trim().toLowerCase())) return false;
      if (platform !== "all" && account.platform !== platform) return false;
      if (health !== "all" && account.health !== health) return false;
      if (authState !== "all" && authStateOf(account) !== authState) return false;
      if (active !== "all" && String(account.isActive) !== active) return false;
      return true;
    });
  }, [accounts, active, authState, health, keyword, platform]);

  const targetAccounts = useMemo(() => accounts.filter((account) => account.kind === "target"), [accounts]);
  const connectableTargets = useMemo(() => targetAccounts.filter((account) => isBrowserLoginPlatform(account.platform)), [targetAccounts]);

  const stats = useMemo(() => ({
    targets: targetAccounts.length,
    connected: connectableTargets.filter((account) => authStateOf(account) === "authenticated").length,
    needsLogin: connectableTargets.filter((account) => ["login_required", "checkpoint", "unknown"].includes(authStateOf(account))).length,
    active: targetAccounts.filter((account) => account.isActive).length
  }), [accounts, connectableTargets, targetAccounts]);

  const actionBusy =
    remove.isPending ||
    toggleActive.isPending ||
    test.isPending ||
    checkSession.isPending ||
    startBrowserLogin.isPending ||
    refreshBrowserLogin.isPending ||
    completeBrowserLogin.isPending ||
    cancelBrowserLogin.isPending;

  return (
    <div className="page-stack">
      <PageHeader
        title="Quản lý tài khoản"
        subtitle="Quản lý tài khoản của user dùng để đăng bài, làm phiên đăng nhập lấy dữ liệu và kiểm tra session health. Nguồn crawl là link page, group, profile hoặc channel của người khác và nhập ở màn Crawl/Chuyển đổi tự động."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
              Làm mới
            </Button>
            <Button icon={<Plus aria-hidden />} onClick={() => setDialogOpen(true)}>
              Thêm tài khoản
            </Button>
          </>
        }
      />

      <div className="metric-grid">
        <SectionCard title="Tài khoản đăng của user"><strong>{stats.targets}</strong></SectionCard>
        <SectionCard title="Đang bật"><strong>{stats.active}</strong></SectionCard>
        <SectionCard title="Session đã kết nối"><strong>{stats.connected}</strong></SectionCard>
        <SectionCard title="Cần xử lý login"><strong>{stats.needsLogin}</strong></SectionCard>
      </div>

      {browserLogin?.sessionId && browserLogin.status !== "cancelled" && browserLogin.status !== "completed" ? (
        <SectionCard
          title="Phiên đăng nhập đang mở"
          description="Làm theo 3 bước bên dưới. Khi đăng nhập xong trong cửa sổ trình duyệt, quay lại đây và bấm Lưu session."
          actions={
            <>
              <Button size="sm" variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => refreshBrowserLogin.mutate(browserLogin)} disabled={actionBusy}>
                Cập nhật
              </Button>
              <Button size="sm" icon={<ShieldCheck aria-hidden />} onClick={() => completeBrowserLogin.mutate(browserLogin)} disabled={actionBusy || browserLogin.status !== "pending"}>
                Lưu session
              </Button>
              <Button size="sm" variant="ghost" icon={<XCircle aria-hidden />} onClick={() => cancelBrowserLogin.mutate(browserLogin)} disabled={actionBusy || browserLogin.status !== "pending"}>
                Hủy
              </Button>
            </>
          }
        >
          <div className="account-flow-steps session-flow">
            <div>
              <LogIn aria-hidden size={16} />
              <span>Đăng nhập trong browser</span>
            </div>
            <div>
              <RefreshCw aria-hidden size={16} />
              <span>Cập nhật trạng thái</span>
            </div>
            <div>
              <ShieldCheck aria-hidden size={16} />
              <span>Lưu session</span>
            </div>
          </div>
          <div className="account-session-grid">
            <div>
              <span>Trạng thái</span>
              <StatusBadge status={browserLogin.status ?? "pending"} />
            </div>
            <div>
              <span>Auth state</span>
              <Badge tone={authTone(browserLogin.authState ?? "unknown")}>{authLabel(browserLogin.authState ?? "unknown")}</Badge>
            </div>
            <div>
              <span>Nền tảng</span>
              <strong>{platformLabel(browserLogin.platform ?? "facebook")}</strong>
            </div>
            <div>
              <span>Kiểm tra gần nhất</span>
              <strong>{formatDate(browserLogin.lastCheckedAt)}</strong>
            </div>
            {browserLogin.currentUrl ? (
              <div className="full">
                <span>URL hiện tại</span>
                <code className="code-inline">{browserLogin.currentUrl}</code>
              </div>
            ) : null}
            {browserLogin.lastError ? (
              <div className="field-error full">
                <span>{browserLogin.lastError}</span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard>
        <FilterToolbar actions={<Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching}>Áp dụng</Button>}>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên, handle, platform..." />
          <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="all">Tất cả nền tảng</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="threads">Threads</option>
            <option value="telegram">Telegram</option>
            <option value="x">X / Twitter</option>
            <option value="zalo-bot">Zalo OA</option>
            <option value="zalo-web">Zalo Web</option>
          </Select>
          <Select value={health} onChange={(event) => setHealth(event.target.value)}>
            <option value="all">Tất cả health</option>
            <option value="healthy">Healthy</option>
            <option value="checkpoint">Checkpoint</option>
            <option value="degraded">Degraded</option>
            <option value="paused">Paused</option>
            <option value="failed">Failed</option>
          </Select>
          <Select value={authState} onChange={(event) => setAuthState(event.target.value)}>
            <option value="all">Tất cả session</option>
            <option value="authenticated">Đã đăng nhập</option>
            <option value="login_required">Cần đăng nhập</option>
            <option value="checkpoint">Checkpoint</option>
            <option value="unknown">Chưa kiểm tra</option>
          </Select>
          <Select value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="all">Tất cả kích hoạt</option>
            <option value="true">Đang bật</option>
            <option value="false">Đang tắt</option>
          </Select>
        </FilterToolbar>

        <AdminDataTable
          rows={rows}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có tài khoản phù hợp" description="Thêm tài khoản mới hoặc nới bộ lọc để xem lại danh sách." />}
          columns={[
            {
              key: "name",
              header: "Tài khoản",
              render: (row) => (
                <div className="account-table-name">
                  <strong>{row.name}</strong>
                  <div className="table-subtle">{row.handle ?? "-"}</div>
                </div>
              )
            },
            { key: "platform", header: "Nền tảng", render: (row) => platformLabel(row.platform) },
            { key: "active", header: "Kích hoạt", render: (row) => <Badge tone={row.isActive ? "good" : "neutral"}>{row.isActive ? "Đang bật" : "Đang tắt"}</Badge> },
            { key: "health", header: "Health", render: (row) => <StatusBadge status={row.health} /> },
            {
              key: "auth",
              header: "Session",
              render: (row) => isBrowserLoginPlatform(row.platform)
                ? <Badge tone={authTone(authStateOf(row))}>{authLabel(authStateOf(row))}</Badge>
                : <Badge tone="neutral">Credentials</Badge>
            },
            { key: "checked", header: "Kiểm tra gần nhất", render: (row) => formatDate(sessionCheckedAt(row)) },
            {
              key: "actions",
              header: "Thao tác",
              render: (row) => (
                <div className="row-actions">
                  <Button size="sm" variant="secondary" icon={<PlayCircle aria-hidden />} onClick={() => test.mutate(row)} disabled={actionBusy}>Test</Button>
                  {isBrowserLoginPlatform(row.platform) && row.kind === "target" ? (
                    <>
                      <Button size="sm" variant="secondary" icon={<ShieldCheck aria-hidden />} onClick={() => checkSession.mutate(row)} disabled={actionBusy}>Check</Button>
                      <Button size="sm" icon={<LogIn aria-hidden />} onClick={() => startBrowserLogin.mutate(row)} disabled={actionBusy}>Mở trình duyệt đăng nhập</Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={row.isActive ? <Square aria-hidden /> : <CheckCircle2 aria-hidden />}
                    onClick={() => toggleActive.mutate({ account: row, value: !row.isActive })}
                    disabled={actionBusy}
                  >
                    {row.isActive ? "Tắt" : "Bật"}
                  </Button>
                  <Button size="sm" variant="danger" icon={<Trash2 aria-hidden />} onClick={() => remove.mutate(row)} disabled={actionBusy}>
                    Xóa
                  </Button>
                </div>
              )
            }
          ]}
        />
      </SectionCard>

      <AddAccountDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        targetMutation={createTarget}
        targetOnly
      />
    </div>
  );
}
