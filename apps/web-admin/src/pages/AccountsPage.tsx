import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LogIn, PlayCircle, Plus, RefreshCw, ShieldCheck, Square, Trash2 } from "lucide-react";
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

type AccountKind = "source" | "target";
type BrowserLoginPlatform = "facebook" | "instagram" | "threads";

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
  authPath?: string;
  sessionDir?: string;
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
  return platform === "facebook" || platform === "instagram" || platform === "threads";
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

function sessionPath(account: Account) {
  return account.sessionState?.authPath ?? account.sessionState?.sessionDir ?? "-";
}

function platformLabel(platform: string) {
  return platformLabels[platform] ?? platform;
}

function connectionSummary(account: Account) {
  if (!isBrowserLoginPlatform(account.platform)) {
    return account.kind === "target" ? "Kết nối bằng credentials/config." : "Dùng để crawl hoặc lấy dữ liệu nguồn.";
  }
  const state = authStateOf(account);
  if (state === "authenticated") return "Session đã sẵn sàng để worker dùng khi đăng bài.";
  if (state === "checkpoint") return "Tài khoản đang cần xác minh checkpoint.";
  if (state === "login_required") return "Cần mở trình duyệt và đăng nhập lại.";
  return "Chưa có trạng thái session, hãy kiểm tra hoặc đăng nhập.";
}

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<"all" | AccountKind>("target");
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("all");
  const [health, setHealth] = useState("all");
  const [authState, setAuthState] = useState("all");
  const [active, setActive] = useState("all");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [browserLogin, setBrowserLogin] = useState<BrowserLoginSession | null>(null);

  const query = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/accounts")
  });

  const invalidateAccounts = async () => {
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const createSource = useMutation({
    mutationFn: (values: unknown) => apiPost("/sources", values),
    onSuccess: async () => {
      setFeedback("Đã thêm tài khoản nguồn.");
      await invalidateAccounts();
    }
  });

  const createTarget = useMutation({
    mutationFn: (values: unknown) => apiPost("/targets", values),
    onSuccess: async () => {
      setFeedback("Đã thêm tài khoản đăng. Nếu là Facebook, Instagram hoặc Threads, hãy bấm Login để lưu session trình duyệt.");
      await invalidateAccounts();
    }
  });

  const remove = useMutation({
    mutationFn: (account: Account) => apiDelete(`/${account.kind === "source" ? "sources" : "targets"}/${account.id}`),
    onSuccess: async (_, account) => {
      setFeedback(`Đã xóa ${account.kind === "source" ? "tài khoản nguồn" : "tài khoản đăng"}.`);
      await invalidateAccounts();
    }
  });

  const toggleActive = useMutation({
    mutationFn: ({ account, value }: AccountAction) => apiPut(`/${account.kind === "source" ? "sources" : "targets"}/${account.id}`, { isActive: value }),
    onSuccess: async (_, action) => {
      setFeedback(action.value ? "Đã bật tài khoản." : "Đã tắt tài khoản.");
      await invalidateAccounts();
    }
  });

  const test = useMutation({
    mutationFn: (account: Account) => apiPost(`/accounts/${account.id}/test`, { kind: account.kind }),
    onSuccess: async () => {
      setFeedback("Đã gửi yêu cầu kiểm tra tài khoản vào worker.");
      await invalidateAccounts();
    }
  });

  const checkSession = useMutation({
    mutationFn: (account: Account) => apiPost<{ health?: BrowserLoginSession["health"] }>(`/accounts/${account.id}/${account.platform}-session/check`, {}),
    onSuccess: async (data) => {
      setFeedback(data.health?.message ?? "Đã kiểm tra session.");
      await invalidateAccounts();
    }
  });

  const startBrowserLogin = useMutation({
    mutationFn: (account: Account) => apiPost<BrowserLoginSession>(`/${account.platform}/accounts/${account.id}/browser-login/start`, {}),
    onSuccess: async (data, account) => {
      setBrowserLogin({ ...data, platform: account.platform as BrowserLoginPlatform, accountId: account.id });
      setFeedback(data.message ?? "Đã mở phiên đăng nhập trình duyệt.");
      await invalidateAccounts();
    }
  });

  const refreshBrowserLogin = useMutation({
    mutationFn: (session: BrowserLoginSession) => apiGet<BrowserLoginSession>(`/${session.platform ?? "facebook"}/browser-login/${session.sessionId}`),
    onSuccess: (data, session) => {
      setBrowserLogin({ ...session, ...data });
      setFeedback("Đã cập nhật trạng thái phiên đăng nhập.");
    }
  });

  const completeBrowserLogin = useMutation({
    mutationFn: (session: BrowserLoginSession) => apiPost<BrowserLoginSession>(`/${session.platform ?? "facebook"}/browser-login/${session.sessionId}/complete`, {}),
    onSuccess: async (data, session) => {
      setBrowserLogin({ ...session, ...data });
      setFeedback(data.message ?? "Đã lưu session vào tài khoản.");
      await invalidateAccounts();
    }
  });

  const cancelBrowserLogin = useMutation({
    mutationFn: (session: BrowserLoginSession) => apiPost<BrowserLoginSession>(`/${session.platform ?? "facebook"}/browser-login/${session.sessionId}/cancel`, {}),
    onSuccess: async (data, session) => {
      setBrowserLogin({ ...session, ...data });
      setFeedback("Đã hủy phiên đăng nhập.");
      await invalidateAccounts();
    }
  });

  const accounts = query.data?.accounts ?? [];
  const rows = useMemo(() => {
    return accounts.filter((account) => {
      const text = [account.name, account.handle, account.platform, account.health, authStateOf(account)].join(" ").toLowerCase();
      if (kind !== "all" && account.kind !== kind) return false;
      if (keyword.trim() && !text.includes(keyword.trim().toLowerCase())) return false;
      if (platform !== "all" && account.platform !== platform) return false;
      if (health !== "all" && account.health !== health) return false;
      if (authState !== "all" && authStateOf(account) !== authState) return false;
      if (active !== "all" && String(account.isActive) !== active) return false;
      return true;
    });
  }, [accounts, active, authState, health, keyword, kind, platform]);

  const targetAccounts = useMemo(() => accounts.filter((account) => account.kind === "target"), [accounts]);
  const connectableTargets = useMemo(() => targetAccounts.filter((account) => isBrowserLoginPlatform(account.platform)), [targetAccounts]);

  const stats = useMemo(() => ({
    targets: targetAccounts.length,
    sources: accounts.filter((account) => account.kind === "source").length,
    connected: connectableTargets.filter((account) => authStateOf(account) === "authenticated").length,
    needsLogin: connectableTargets.filter((account) => ["login_required", "checkpoint", "unknown"].includes(authStateOf(account))).length
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
    <>
      <PageHeader
        title="Tài khoản"
        subtitle="Kết nối tài khoản đăng, lưu session trình duyệt và kiểm tra session health trước khi worker publish nội dung."
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
        <SectionCard title="Tài khoản đăng"><strong>{stats.targets}</strong></SectionCard>
        <SectionCard title="Tài khoản nguồn"><strong>{stats.sources}</strong></SectionCard>
        <SectionCard title="Session đã kết nối"><strong>{stats.connected}</strong></SectionCard>
        <SectionCard title="Cần xử lý login"><strong>{stats.needsLogin}</strong></SectionCard>
      </div>

      {feedback ? <div className="inline-alert">{feedback}</div> : null}

      {browserLogin?.sessionId ? (
        <SectionCard
          title="Phiên đăng nhập đang mở"
          description="Đăng nhập trong cửa sổ trình duyệt vừa mở, sau đó quay lại đây để lưu session vào tài khoản."
          actions={
            <>
              <Button size="sm" variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => refreshBrowserLogin.mutate(browserLogin)} disabled={actionBusy}>
                Cập nhật
              </Button>
              <Button size="sm" icon={<ShieldCheck aria-hidden />} onClick={() => completeBrowserLogin.mutate(browserLogin)} disabled={actionBusy || browserLogin.status !== "pending"}>
                Lưu session
              </Button>
              <Button size="sm" variant="ghost" icon={<Square aria-hidden />} onClick={() => cancelBrowserLogin.mutate(browserLogin)} disabled={actionBusy || browserLogin.status !== "pending"}>
                Hủy
              </Button>
            </>
          }
        >
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
            <div className="full">
              <span>Session path</span>
              <code className="code-inline">{browserLogin.authPath ?? browserLogin.sessionDir ?? "-"}</code>
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

      <SectionCard
        title="Kết nối nhanh"
        description="Facebook, Instagram và Threads dùng browser session. Telegram/X dùng credentials đã lưu trong tài khoản."
      >
        {connectableTargets.length > 0 ? (
          <div className="account-connect-grid">
            {connectableTargets.slice(0, 6).map((account) => {
              const state = authStateOf(account);
              return (
                <div className="account-connect-card" key={account.id}>
                  <div className="account-connect-head">
                    <div className="account-avatar" aria-hidden>{platformLabel(account.platform).slice(0, 2).toUpperCase()}</div>
                    <div className="account-meta-stack">
                      <strong>{account.name}</strong>
                      <span>{platformLabel(account.platform)} · {account.handle ?? "chưa có handle"}</span>
                    </div>
                    <Badge tone={authTone(state)}>{authLabel(state)}</Badge>
                  </div>
                  <p>{connectionSummary(account)}</p>
                  <div className="row-actions">
                    <Button size="sm" icon={<LogIn aria-hidden />} onClick={() => startBrowserLogin.mutate(account)} disabled={actionBusy}>
                      Login
                    </Button>
                    <Button size="sm" variant="secondary" icon={<ShieldCheck aria-hidden />} onClick={() => checkSession.mutate(account)} disabled={actionBusy}>
                      Check
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Chưa có tài khoản hỗ trợ browser login" description="Thêm tài khoản Facebook, Instagram hoặc Threads để bắt đầu kết nối session." />
        )}
      </SectionCard>

      <SectionCard>
        <FilterToolbar actions={<Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching}>Áp dụng</Button>}>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên, handle, platform..." />
          <Select value={kind} onChange={(event) => setKind(event.target.value as "all" | AccountKind)}>
            <option value="all">Tất cả loại</option>
            <option value="target">Tài khoản đăng</option>
            <option value="source">Tài khoản nguồn</option>
          </Select>
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
            { key: "kind", header: "Loại", render: (row) => row.kind === "source" ? "Nguồn" : "Đăng bài" },
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
            { key: "path", header: "Session path", render: (row) => <code className="code-inline">{sessionPath(row)}</code> },
            {
              key: "actions",
              header: "Thao tác",
              render: (row) => (
                <div className="row-actions">
                  <Button size="sm" variant="secondary" icon={<PlayCircle aria-hidden />} onClick={() => test.mutate(row)} disabled={actionBusy}>Test</Button>
                  {isBrowserLoginPlatform(row.platform) && row.kind === "target" ? (
                    <>
                      <Button size="sm" variant="secondary" icon={<ShieldCheck aria-hidden />} onClick={() => checkSession.mutate(row)} disabled={actionBusy}>Check</Button>
                      <Button size="sm" icon={<LogIn aria-hidden />} onClick={() => startBrowserLogin.mutate(row)} disabled={actionBusy}>Login</Button>
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
        sourceMutation={createSource}
        targetMutation={createTarget}
      />
    </>
  );
}
