import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, PencilLine, Plus, QrCode, RefreshCw, TestTube2, Trash2 } from "lucide-react";
import { apiAssetUrl, apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { platformLabel, type RepostAccount } from "./repostTypes";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";

type ManagedAccount = RepostAccount & { credentials?: Record<string, unknown> | null };
type SetupStage = "details" | "connect" | "ready";
type TelegramLoginState = "idle" | "code_sent" | "password_required" | "completed";
type AccountSession = {
  status: string;
  data?: { qrReady?: boolean; qrUpdatedAt?: string | null; error?: string } | null;
};
type TelegramLoginResponse = {
  login: { status: Exclude<TelegramLoginState, "idle">; phoneNumber: string; isCodeViaApp?: boolean };
};
type AccountForm = {
  platform: "telegram" | "zalo-personal";
  name: string;
  apiId: string;
  apiHash: string;
  phoneNumber: string;
  loginCode: string;
  twoFactorPassword: string;
  note: string;
};

const initialForm: AccountForm = {
  platform: "zalo-personal",
  name: "",
  apiId: "",
  apiHash: "",
  phoneNumber: "",
  loginCode: "",
  twoFactorPassword: "",
  note: ""
};

function readString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function validateForm(form: AccountForm) {
  if (!form.name.trim()) return "Cần nhập tên tài khoản.";
  if (form.platform === "telegram") {
    if (!Number.isInteger(Number(form.apiId)) || Number(form.apiId) <= 0) return "Telegram API ID phải là số nguyên dương.";
    if (!form.apiHash.trim()) return "Cần nhập Telegram API Hash.";
    if (!/^\+[1-9]\d{6,14}$/.test(form.phoneNumber.replace(/[\s().-]/g, ""))) {
      return "Nhập số Telegram theo mã quốc gia, ví dụ +84901234567.";
    }
  }
  return null;
}

function sessionLabel(status?: string) {
  return ({
    created: "Đã tạo phiên",
    open_for_login: "Đang chờ quét QR",
    login_ok: "Đã đăng nhập",
    login_failed: "Đăng nhập thất bại"
  } as Record<string, string>)[status ?? ""] ?? "Chưa kết nối";
}

export function AccountsManagementPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const kind = "source"; // Sử dụng sourceAccount làm thực thể tài khoản dùng chung
  const collectionPath = "/sources";
  const collectionKey = "sources";
  const endpointKey = "source";
  const [keyword, setKeyword] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [stage, setStage] = useState<SetupStage>("details");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [qrTimestamp, setQrTimestamp] = useState(() => Date.now());
  const [qrRequested, setQrRequested] = useState(false);
  const [telegramLoginState, setTelegramLoginState] = useState<TelegramLoginState>("idle");

  const accountsQuery = useQuery({
    queryKey: [collectionKey],
    queryFn: () => apiGet<Record<typeof collectionKey, ManagedAccount[]>>(collectionPath)
  });
  const accounts = accountsQuery.data?.[collectionKey] ?? [];
  const currentAccount = accounts.find((account) => account.id === accountId);
  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return query ? accounts.filter((account) => [account.name, account.platform, account.health].join(" ").toLowerCase().includes(query)) : accounts;
  }, [accounts, keyword]);

  const sessionQuery = useQuery({
    queryKey: ["account-session", kind, accountId],
    queryFn: () => apiGet<{ session: AccountSession | null }>(`/accounts/${kind}/${accountId}/session`),
    enabled: Boolean(accountId && form.platform === "zalo-personal"),
    retry: false,
    refetchInterval: (query) => qrRequested && stage === "connect" && query.state.data?.session?.status !== "login_ok" ? 2500 : false
  });
  const session = sessionQuery.data?.session;

  useEffect(() => {
    if (session?.status === "login_ok" && stage === "connect") {
      setStage("ready");
      toast.success("Đăng nhập Zalo thành công. Bạn có thể chọn các kênh của tài khoản này ở trang Kênh nguồn / Kênh đích.");
    }
    if (session?.data?.qrUpdatedAt) setQrTimestamp(new Date(session.data.qrUpdatedAt).getTime());
  }, [session?.data?.qrUpdatedAt, session?.status, stage, toast]);

  const resetSetup = () => {
    setStage("details");
    setEditingId(null);
    setAccountId(null);
    setForm(initialForm);
    setQrRequested(false);
    setTelegramLoginState("idle");
  };
  const invalidateAccounts = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: [collectionKey] }),
    queryClient.invalidateQueries({ queryKey: ["connected-accounts"] })
  ]);

  const startQr = useMutation({
    mutationFn: async (id: string) => {
      await apiPost(`/accounts/${kind}/${id}/session/create`, {});
      return apiPost(`/accounts/${kind}/${id}/session/zalo-qr`, {});
    },
    onSuccess: async (_, id) => {
      setQrRequested(true);
      setQrTimestamp(Date.now());
      setStage("connect");
      toast.success("Mã QR đang được tạo. Hãy quét bằng ứng dụng Zalo.");
      await queryClient.invalidateQueries({ queryKey: ["account-session", kind, id] });
    },
    onError: (error) => toast.error(error.message)
  });
  const startTelegram = useMutation({
    mutationFn: (id: string) => apiPost<TelegramLoginResponse>(`/accounts/${kind}/${id}/session/telegram/start`, {
      apiId: Number(form.apiId),
      apiHash: form.apiHash.trim(),
      phoneNumber: form.phoneNumber.trim()
    }),
    onSuccess: ({ login }) => {
      setTelegramLoginState(login.status);
      setStage("connect");
      toast.success(login.isCodeViaApp ? "Telegram đã gửi mã trong ứng dụng." : "Telegram đã gửi mã xác nhận.");
    },
    onError: (error) => toast.error(error.message)
  });
  const completeTelegram = async (login: TelegramLoginResponse["login"]) => {
    setTelegramLoginState(login.status);
    if (login.status === "password_required") {
      toast.success("OTP hợp lệ. Hãy nhập mật khẩu xác minh hai bước.");
      return;
    }
    setStage("ready");
    toast.success("Đăng nhập Telegram thành công. Bạn có thể chọn các kênh của tài khoản này ở trang Kênh nguồn / Kênh đích.");
    await invalidateAccounts();
  };
  const submitTelegramCode = useMutation({
    mutationFn: () => apiPost<TelegramLoginResponse>(`/accounts/${kind}/${accountId}/session/telegram/code`, { code: form.loginCode.trim() }),
    onSuccess: ({ login }) => void completeTelegram(login),
    onError: (error) => toast.error(error.message)
  });
  const submitTelegramPassword = useMutation({
    mutationFn: () => apiPost<TelegramLoginResponse>(`/accounts/${kind}/${accountId}/session/telegram/password`, { password: form.twoFactorPassword }),
    onSuccess: ({ login }) => void completeTelegram(login),
    onError: (error) => toast.error(error.message)
  });
  const saveDetails = useMutation({
    mutationFn: async () => {
      const validationError = validateForm(form);
      if (validationError) throw new Error(validationError);
      const payload = {
        platform: form.platform,
        name: form.name.trim(),
        isActive: false,
        config: { note: form.note.trim() },
        ...(form.platform === "telegram" ? {
          credentials: {
            ...(currentAccount?.credentials ?? {}),
            apiId: Number(form.apiId),
            apiHash: form.apiHash.trim(),
            phoneNumber: form.phoneNumber.replace(/[\s().-]/g, "")
          }
        } : {})
      };
      const result = editingId
        ? await apiPut<Record<typeof endpointKey, ManagedAccount>>(`${collectionPath}/${editingId}`, payload)
        : await apiPost<Record<typeof endpointKey, ManagedAccount>>(collectionPath, payload);
      return result[endpointKey];
    },
    onSuccess: async (account) => {
      setEditingId(account.id);
      setAccountId(account.id);
      await invalidateAccounts();
      if (form.platform === "zalo-personal") startQr.mutate(account.id);
      else startTelegram.mutate(account.id);
    },
    onError: (error) => toast.error(error.message)
  });
  const testAccount = useMutation({
    mutationFn: (id: string) => apiPost(`/accounts/${id}/test`, { kind }),
    onSuccess: () => toast.success("Đã gửi yêu cầu kiểm tra kết nối."),
    onError: (error) => toast.error(error.message)
  });
  const toggleAccount = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiPut(`${collectionPath}/${id}`, { isActive }),
    onSuccess: async (_, input) => {
      toast.success(input.isActive ? "Đã bật tài khoản." : "Đã tạm tắt tài khoản.");
      await invalidateAccounts();
    },
    onError: (error) => toast.error(error.message)
  });
  const removeAccount = useMutation({
    mutationFn: (id: string) => apiDelete(`${collectionPath}/${id}`),
    onSuccess: async () => {
      toast.success("Đã xóa tài khoản.");
      await invalidateAccounts();
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const editAccount = (account: ManagedAccount) => {
    const credentials = account.credentials ?? {};
    setEditingId(account.id);
    setAccountId(account.id);
    setForm({
      platform: account.platform === "zalo-personal" ? "zalo-personal" : "telegram",
      name: account.name,
      apiId: readString(credentials.apiId),
      apiHash: readString(credentials.apiHash),
      phoneNumber: readString(credentials.phoneNumber),
      loginCode: "",
      twoFactorPassword: "",
      note: readString(account.config?.note)
    });
    setStage("details");
    setShowSetup(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentStep = ({ details: 1, connect: 2, ready: 3 })[stage];
  const qrUrl = accountId ? apiAssetUrl(`/accounts/${kind}/${accountId}/session/qr.png?t=${qrTimestamp}`) : "";

  return (
    <div className="page-stack">
      <PageHeader
        title="Quản lý tài khoản"
        subtitle="Kết nối tài khoản Zalo cá nhân hoặc Telegram. Một tài khoản sau khi kết nối thành công có thể dùng làm kênh nguồn (để lấy tin) và kênh đích (để đăng bài)."
        actions={<><Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => accountsQuery.refetch()}>Làm mới</Button><Button icon={<Plus aria-hidden />} onClick={() => { resetSetup(); setShowSetup(true); }}>Kết nối tài khoản</Button></>}
      />

      {showSetup ? (
        <SectionCard
          className="account-setup-card"
          title={editingId ? "Kết nối lại tài khoản" : "Kết nối tài khoản mới"}
          description="Nhập thông tin xác thực để Zerun lưu phiên đăng nhập."
          actions={<Button variant="ghost" size="sm" onClick={() => setShowSetup(false)}>Đóng</Button>}
        >
          <div className="account-wizard-steps">
            {["Thông tin", "Xác thực", "Hoàn tất"].map((label, index) => (
              <div key={label} className={currentStep >= index + 1 ? "active" : ""}>
                <span>{currentStep > index + 1 ? <CheckCircle2 size={15} aria-hidden /> : index + 1}</span><strong>{label}</strong>
              </div>
            ))}
          </div>
          {stage === "details" ? (
            <div className="account-wizard-panel">
              <div className="choice-grid account-platform-choice">
                <button type="button" className={`choice-card ${form.platform === "zalo-personal" ? "active" : ""}`} onClick={() => setForm((current) => ({ ...current, platform: "zalo-personal" }))}>
                  <span className="choice-title"><QrCode size={18} aria-hidden /> Zalo cá nhân</span><span>Quét QR để app tự lưu phiên.</span>
                </button>
                <button type="button" className={`choice-card ${form.platform === "telegram" ? "active" : ""}`} onClick={() => setForm((current) => ({ ...current, platform: "telegram" }))}>
                  <span className="choice-title">Telegram MTProto</span><span>Nhập API ID, API Hash và xác nhận OTP.</span>
                </button>
              </div>
              <div className="form-grid">
                <label className="span-2"><Label>Tên tài khoản</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ví dụ: Zalo cá nhân bán hàng" /></label>
                {form.platform === "telegram" ? <>
                  <label><Label>Telegram API ID</Label><Input inputMode="numeric" value={form.apiId} onChange={(event) => setForm((current) => ({ ...current, apiId: event.target.value }))} /></label>
                  <label><Label>Telegram API Hash</Label><Input type="password" value={form.apiHash} onChange={(event) => setForm((current) => ({ ...current, apiHash: event.target.value }))} /></label>
                  <label className="span-2"><Label>Số điện thoại Telegram</Label><Input type="tel" value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="+84901234567" /></label>
                </> : null}
                <label className="span-2"><Label>Ghi chú</Label><Textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
                <div className="span-2 actions"><Button icon={<ChevronRight aria-hidden />} onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending}>{form.platform === "zalo-personal" ? "Lưu và mở QR" : "Lưu và gửi OTP"}</Button></div>
              </div>
            </div>
          ) : null}
          {stage === "connect" ? (
            <div className="account-wizard-panel account-connect-stage">
              <div className="account-connect-summary"><div><span className="eyebrow">Đang kết nối</span><strong>{form.name}</strong></div><Badge tone="warn">{form.platform === "telegram" ? "Chờ xác thực" : sessionLabel(session?.status)}</Badge></div>
              {form.platform === "telegram" ? (
                <div className="qr-login-box">
                  {telegramLoginState === "password_required" ? <>
                    <p>Nhập mật khẩu xác minh hai bước của Telegram.</p>
                    <label className="field"><Label>Mật khẩu 2FA</Label><Input type="password" value={form.twoFactorPassword} onChange={(event) => setForm((current) => ({ ...current, twoFactorPassword: event.target.value }))} /></label>
                    <Button onClick={() => submitTelegramPassword.mutate()} disabled={!form.twoFactorPassword}>Xác nhận mật khẩu</Button>
                  </> : <>
                    <p>Nhập mã Telegram gửi cho <strong>{form.phoneNumber}</strong>. App sẽ tự tạo StringSession sau khi xác thực.</p>
                    <label className="field"><Label>Mã xác nhận</Label><Input inputMode="numeric" value={form.loginCode} onChange={(event) => setForm((current) => ({ ...current, loginCode: event.target.value }))} /></label>
                    <Button onClick={() => submitTelegramCode.mutate()} disabled={!form.loginCode.trim()}>Xác nhận OTP</Button>
                  </>}
                </div>
              ) : (
                <div className="qr-login-box">
                  <p>Quét mã bằng ứng dụng Zalo và xác nhận đăng nhập.</p>
                  {session?.data?.qrReady ? <img src={qrUrl} alt={`Mã QR đăng nhập Zalo cho ${form.name}`} /> : <div className="qr-placeholder"><QrCode size={54} aria-hidden /><span>Đang tạo mã QR...</span></div>}
                  {session?.data?.error ? <p className="field-error">{session.data.error}</p> : null}
                </div>
              )}
              <div className="actions"><Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => accountId && (form.platform === "telegram" ? startTelegram.mutate(accountId) : startQr.mutate(accountId))}>Thử lại</Button></div>
            </div>
          ) : null}
          {stage === "ready" ? (
            <div className="account-wizard-panel">
              <div className="setup-complete-card"><CheckCircle2 size={28} aria-hidden /><div><span className="eyebrow">Đã kết nối</span><h3>{form.name}</h3><p>Tài khoản đã sẵn sàng hoạt động. Bây giờ bạn có thể đóng wizard này và sang các mục quản lý kênh để thêm nhóm/kênh.</p></div></div>
              <div className="actions">
                <Button variant="secondary" icon={<TestTube2 aria-hidden />} onClick={() => accountId && testAccount.mutate(accountId)}>Kiểm tra kết nối</Button>
                <Button icon={<CheckCircle2 aria-hidden />} onClick={() => accountId && toggleAccount.mutate({ id: accountId, isActive: true })}>Bật tài khoản</Button>
                <Button variant="ghost" onClick={() => setShowSetup(false)}>Đóng</Button>
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard title="Danh sách tài khoản đã kết nối" description="Danh sách tài khoản Zalo cá nhân, Telegram MTProto dùng chung cho hệ thống.">
        <FilterToolbar><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên, nền tảng, trạng thái kết nối..." /></FilterToolbar>
        <AdminDataTable
          rows={rows}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có tài khoản nào" description="Bấm Kết nối tài khoản để bắt đầu." />}
          columns={[
            { key: "name", header: "Tài khoản", render: (row) => <strong>{row.name}</strong> },
            { key: "platform", header: "Nền tảng", render: (row) => platformLabel(row.platform) },
            { key: "health", header: "Kết nối", render: (row) => <Badge tone={row.health === "healthy" ? "good" : row.health === "failed" ? "danger" : "neutral"}>{row.health}</Badge> },
            { key: "active", header: "Trạng thái", render: (row) => <Badge tone={row.isActive ? "good" : "neutral"}>{row.isActive ? "Đang bật" : "Tạm tắt"}</Badge> },
            { key: "actions", header: "Thao tác", render: (row) => <div className="row-actions">
              <Button size="sm" variant="secondary" icon={<PencilLine aria-hidden />} onClick={() => editAccount(row)}>Kết nối lại</Button>
              <Button size="sm" variant="secondary" icon={<TestTube2 aria-hidden />} onClick={() => testAccount.mutate(row.id)}>Kiểm tra</Button>
              <Button size="sm" variant="ghost" onClick={() => toggleAccount.mutate({ id: row.id, isActive: !row.isActive })}>{row.isActive ? "Tắt" : "Bật"}</Button>
              <Button size="sm" variant="danger" icon={<Trash2 aria-hidden />} onClick={() => removeAccount.mutate(row.id)}>Xóa</Button>
            </div> }
          ]}
        />
      </SectionCard>
    </div>
  );
}
