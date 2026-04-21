import { AlertCircle, CheckCircle2, Facebook, Instagram, MessageCircle, Send, Shield, Sparkles, Twitter } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { FacebookAccountForm } from "../components/accounts/FacebookAccountForm";
import { InstagramAccountForm } from "../components/accounts/InstagramAccountForm";
import { TelegramAccountForm } from "../components/accounts/TelegramAccountForm";
import { ThreadsAccountForm } from "../components/accounts/ThreadsAccountForm";
import { XAccountForm } from "../components/accounts/XAccountForm";

export type AccountKind = "source" | "target";
export type AccountPlatform = "facebook" | "telegram" | "x" | "threads" | "instagram";

export type AccountDraft = {
  kind: AccountKind;
  platform: AccountPlatform;
  name: string;
  handle: string;
  authPath: string;
  sessionDir: string;
  configText: string;
  credentialsText: string;
  facebookAccountType: "profile" | "page";
  telegramApiId: string;
  telegramApiHash: string;
  telegramSession: string;
  telegramPhone: string;
  xUsername: string;
  xPassword: string;
  xEmail: string;
  xTwoFactorSecret: string;
  threadsSessionDir: string;
  threadsUsername: string;
  threadsPassword: string;
  instagramUsername: string;
  instagramPassword: string;
};

export type AccountFormValues = {
  name: string;
  platform: AccountPlatform;
  handle?: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  isActive: boolean;
};

export type FormErrors = Partial<Record<keyof AccountDraft | "form", string>>;

export const ACCOUNT_KIND_OPTIONS: Array<{ value: AccountKind; label: string; description: string }> = [
  { value: "source", label: "Nguồn", description: "Dùng để crawl hoặc lấy nội dung đầu vào." },
  { value: "target", label: "Đăng bài", description: "Dùng để đăng bài hoặc xuất bản nội dung." }
];

export const PLATFORM_OPTIONS: Array<{ value: AccountPlatform; label: string; description: string; icon: ReactNode }> = [
  { value: "facebook", label: "Facebook", description: "Dùng cho page hoặc profile đăng bài.", icon: <Facebook aria-hidden size={16} /> },
  { value: "telegram", label: "Telegram", description: "Dùng session MTProto để đọc hoặc đăng vào channel/group.", icon: <Send aria-hidden size={16} /> },
  { value: "x", label: "X / Twitter", description: "Dùng username, password, email và 2FA khi cần.", icon: <Twitter aria-hidden size={16} /> },
  { value: "threads", label: "Threads", description: "Dùng sessionDir hoặc credential Instagram liên kết.", icon: <MessageCircle aria-hidden size={16} /> },
  { value: "instagram", label: "Instagram", description: "Tài khoản Instagram cơ bản bằng username và password.", icon: <Instagram aria-hidden size={16} /> }
];

export function createEmptyDraft(kind: AccountKind = "target", platform: AccountPlatform = "facebook"): AccountDraft {
  return {
    kind,
    platform,
    name: "",
    handle: "",
    authPath: "",
    sessionDir: "",
    configText: "{}",
    credentialsText: "{}",
    facebookAccountType: "profile",
    telegramApiId: "",
    telegramApiHash: "",
    telegramSession: "",
    telegramPhone: "",
    xUsername: "",
    xPassword: "",
    xEmail: "",
    xTwoFactorSecret: "",
    threadsSessionDir: "",
    threadsUsername: "",
    threadsPassword: "",
    instagramUsername: "",
    instagramPassword: ""
  };
}

export function parseJsonObject(value: string, fieldLabel: string): { value?: Record<string, unknown>; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { value: {} };
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: `${fieldLabel} phải là JSON object hợp lệ.` };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: `${fieldLabel} không phải JSON hợp lệ.` };
  }
}

export function validatePath(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/[<>|?*"]/g.test(trimmed)) {
    return 'Đường dẫn chứa ký tự không hợp lệ (< > | ? * ").';
  }
  return undefined;
}

export function validateDraft(draft: AccountDraft): FormErrors {
  const errors: FormErrors = {};

  if (!draft.name.trim()) errors.name = "Vui lòng nhập tên hiển thị.";
  if (draft.handle.trim() && draft.handle.trim().length < 2) errors.handle = "Handle hoặc URL quá ngắn.";

  const configResult = parseJsonObject(draft.configText, "Config JSON");
  if (configResult.error) errors.configText = configResult.error;

  const credentialsResult = parseJsonObject(draft.credentialsText, "Credentials JSON");
  if (credentialsResult.error) errors.credentialsText = credentialsResult.error;

  if (draft.platform === "facebook") {
    const authPathError = validatePath(draft.authPath);
    const sessionDirError = validatePath(draft.sessionDir);
    if (authPathError) errors.authPath = authPathError;
    if (sessionDirError) errors.sessionDir = sessionDirError;
  }

  if (draft.platform === "telegram") {
    if (!draft.telegramApiId.trim()) errors.telegramApiId = "apiId là bắt buộc.";
    if (!draft.telegramApiHash.trim()) errors.telegramApiHash = "apiHash là bắt buộc.";
    if (!draft.telegramSession.trim()) errors.telegramSession = "Session string là bắt buộc.";
  }

  if (draft.platform === "x") {
    if (!draft.xUsername.trim()) errors.xUsername = "Username là bắt buộc.";
    if (!draft.xPassword.trim()) errors.xPassword = "Password là bắt buộc.";
    if (!draft.xEmail.trim()) errors.xEmail = "Email xác thực là bắt buộc.";
  }

  if (draft.platform === "threads") {
    if (!draft.threadsSessionDir.trim() && (!draft.threadsUsername.trim() || !draft.threadsPassword.trim())) {
      errors.threadsSessionDir = "Nhập sessionDir hoặc cung cấp username/password Instagram.";
      if (!draft.threadsUsername.trim()) errors.threadsUsername = "Username Instagram là bắt buộc khi không có sessionDir.";
      if (!draft.threadsPassword.trim()) errors.threadsPassword = "Password Instagram là bắt buộc khi không có sessionDir.";
    }
    const threadsPathError = validatePath(draft.threadsSessionDir);
    if (threadsPathError) errors.threadsSessionDir = threadsPathError;
  }

  if (draft.platform === "instagram") {
    if (!draft.instagramUsername.trim()) errors.instagramUsername = "Username Instagram là bắt buộc.";
    if (!draft.instagramPassword.trim()) errors.instagramPassword = "Password Instagram là bắt buộc.";
  }

  return errors;
}

export function buildAccountPayload(draft: AccountDraft): AccountFormValues {
  const config = parseJsonObject(draft.configText, "Config JSON").value ?? {};
  const extraCredentials = parseJsonObject(draft.credentialsText, "Credentials JSON").value ?? {};

  let platformCredentials: Record<string, unknown> = {};

  if (draft.platform === "facebook") {
    platformCredentials = {
      accountType: draft.facebookAccountType,
      ...(draft.authPath.trim() ? { authPath: draft.authPath.trim() } : {}),
      ...(draft.sessionDir.trim() ? { sessionDir: draft.sessionDir.trim() } : {})
    };
  }

  if (draft.platform === "telegram") {
    platformCredentials = {
      apiId: draft.telegramApiId.trim(),
      apiHash: draft.telegramApiHash.trim(),
      session: draft.telegramSession.trim(),
      ...(draft.telegramPhone.trim() ? { phone: draft.telegramPhone.trim() } : {})
    };
  }

  if (draft.platform === "x") {
    platformCredentials = {
      username: draft.xUsername.trim(),
      password: draft.xPassword.trim(),
      email: draft.xEmail.trim(),
      ...(draft.xTwoFactorSecret.trim() ? { twoFactorSecret: draft.xTwoFactorSecret.trim() } : {})
    };
  }

  if (draft.platform === "threads") {
    platformCredentials = {
      ...(draft.threadsSessionDir.trim() ? { sessionDir: draft.threadsSessionDir.trim() } : {}),
      ...(draft.threadsUsername.trim() ? { username: draft.threadsUsername.trim() } : {}),
      ...(draft.threadsPassword.trim() ? { password: draft.threadsPassword.trim() } : {})
    };
  }

  if (draft.platform === "instagram") {
    platformCredentials = {
      username: draft.instagramUsername.trim(),
      password: draft.instagramPassword.trim()
    };
  }

  return {
    name: draft.name.trim(),
    platform: draft.platform,
    handle: draft.handle.trim() || undefined,
    credentials: { ...platformCredentials, ...extraCredentials },
    config,
    isActive: true
  };
}

function PlatformSpecificFields({ draft, errors, setDraft }: PlatformFieldsProps) {
  if (draft.platform === "facebook") return <FacebookAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
  if (draft.platform === "telegram") return <TelegramAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
  if (draft.platform === "x") return <XAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
  if (draft.platform === "threads") return <ThreadsAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
  return <InstagramAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
}

export type PlatformFieldsProps = {
  draft: AccountDraft;
  errors: FormErrors;
  setDraft: React.Dispatch<React.SetStateAction<AccountDraft>>;
};

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="field-error" role="alert">
      <AlertCircle aria-hidden size={14} />
      <span>{message}</span>
    </div>
  );
}

export function InlineNote({ tone = "info", children }: { tone?: "info" | "success" | "warning"; children: ReactNode }) {
  return <div className={`inline-note ${tone}`}>{children}</div>;
}

export function AccountForm({
  label,
  description,
  submitLabel,
  fixedKind,
  defaultPlatform = "facebook",
  isSubmitting = false,
  submitError,
  submitSuccess,
  onSubmit
}: {
  label: string;
  description?: string;
  submitLabel?: string;
  fixedKind: AccountKind;
  defaultPlatform?: AccountPlatform;
  isSubmitting?: boolean;
  submitError?: string;
  submitSuccess?: string;
  onSubmit: (values: AccountFormValues) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<AccountDraft>(() => createEmptyDraft(fixedKind, defaultPlatform));
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    setDraft(createEmptyDraft(fixedKind, defaultPlatform));
    setErrors({});
  }, [fixedKind, defaultPlatform]);

  const helpTitle = useMemo(() => {
    return fixedKind === "target" ? "Mẫu thêm tài khoản đăng" : "Mẫu thêm tài khoản nguồn";
  }, [fixedKind]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSubmit(buildAccountPayload(draft));
    setDraft(createEmptyDraft(fixedKind, draft.platform));
    setErrors({});
  }

  return (
    <form className="panel panel-pad account-form-shell" onSubmit={handleSubmit}>
      <div className="account-form-header">
        <div>
          <h2>{label}</h2>
          {description ? <p className="muted-copy">{description}</p> : null}
        </div>
        <div className="kind-pill">
          <Shield aria-hidden size={14} />
          <span>{fixedKind === "source" ? "Nguồn" : "Đăng bài"}</span>
        </div>
      </div>

      <InlineNote>
        <strong>{helpTitle}.</strong> Nếu cần tạo theo nhiều bước, dùng trang <em>Tài khoản đăng</em> để thao tác tập trung hơn.
      </InlineNote>

      {submitError ? <FormError message={submitError} /> : null}
      {submitSuccess ? (
        <div className="field-success" role="status">
          <CheckCircle2 aria-hidden size={14} />
          <span>{submitSuccess}</span>
        </div>
      ) : null}

      <div className="form-grid" style={{ marginTop: 14 }}>
        <div className="field">
          <Label htmlFor={`${fixedKind}-name`}>Tên hiển thị</Label>
          <Input id={`${fixedKind}-name`} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ví dụ: Facebook Page A" />
          <FormError message={errors.name} />
        </div>
        <div className="field">
          <Label htmlFor={`${fixedKind}-platform`}>Nền tảng</Label>
          <Select id={`${fixedKind}-platform`} value={draft.platform} onChange={(event) => setDraft((current) => ({ ...current, platform: event.target.value as AccountPlatform }))}>
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="field full">
          <Label htmlFor={`${fixedKind}-handle`}>Handle hoặc URL mặc định</Label>
          <Input id={`${fixedKind}-handle`} value={draft.handle} onChange={(event) => setDraft((current) => ({ ...current, handle: event.target.value }))} placeholder="@page, @channel hoặc URL profile/group" />
          <FormError message={errors.handle} />
        </div>
      </div>

      <div className="platform-card-grid">
        {PLATFORM_OPTIONS.map((option) => (
          <button key={option.value} type="button" className={`platform-choice ${draft.platform === option.value ? "active" : ""}`} onClick={() => setDraft((current) => ({ ...current, platform: option.value }))}>
            <div className="platform-choice-title">
              {option.icon}
              <span>{option.label}</span>
            </div>
            <small>{option.description}</small>
          </button>
        ))}
      </div>

      <PlatformSpecificFields draft={draft} errors={errors} setDraft={setDraft} />

      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field full">
          <Label htmlFor={`${fixedKind}-credentials`}>Credentials JSON bổ sung</Label>
          <Textarea id={`${fixedKind}-credentials`} value={draft.credentialsText} onChange={(event) => setDraft((current) => ({ ...current, credentialsText: event.target.value }))} placeholder={'{\n  "proxy": "http://127.0.0.1:8080"\n}'} />
          <FormError message={errors.credentialsText} />
        </div>
        <div className="field full">
          <Label htmlFor={`${fixedKind}-config`}>Config JSON</Label>
          <Textarea id={`${fixedKind}-config`} value={draft.configText} onChange={(event) => setDraft((current) => ({ ...current, configText: event.target.value }))} placeholder={'{\n  "campaignId": "sample_id"\n}'} />
          <FormError message={errors.configText} />
        </div>
      </div>

      <div className="actions" style={{ marginTop: 16 }}>
        <Button disabled={isSubmitting}>{isSubmitting ? "Đang lưu..." : submitLabel ?? "Lưu"}</Button>
        <Button type="button" variant="ghost" onClick={() => {
          setDraft(createEmptyDraft(fixedKind, draft.platform));
          setErrors({});
        }} disabled={isSubmitting}>
          Làm trống
        </Button>
        <div className="muted-chip">
          <Sparkles aria-hidden size={14} />
          <span>Kiểm tra theo nền tảng, JSON và đường dẫn session</span>
        </div>
      </div>
    </form>
  );
}
