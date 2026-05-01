import { AlertCircle, Facebook, Instagram, MessageCircle, Send, Shield, Sparkles, Twitter } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { TelegramAccountForm } from "../components/accounts/TelegramAccountForm";
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
  threadsAccessToken: string;
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
  { value: "facebook", label: "Facebook", description: "Lưu tài khoản rồi đăng nhập bằng cửa sổ trình duyệt.", icon: <Facebook aria-hidden size={16} /> },
  { value: "instagram", label: "Instagram", description: "Lưu tài khoản rồi đăng nhập bằng cửa sổ trình duyệt.", icon: <Instagram aria-hidden size={16} /> },
  { value: "threads", label: "Threads", description: "Lưu tài khoản rồi đăng nhập bằng cửa sổ trình duyệt.", icon: <MessageCircle aria-hidden size={16} /> },
  { value: "x", label: "X / Twitter", description: "Lưu tài khoản rồi đăng nhập bằng cửa sổ trình duyệt.", icon: <Twitter aria-hidden size={16} /> },
  { value: "telegram", label: "Telegram", description: "Dùng API ID, API Hash và session string MTProto.", icon: <Send aria-hidden size={16} /> },
];

export function isBrowserLoginPlatform(platform: string): platform is "facebook" | "instagram" | "threads" | "x" {
  return platform === "facebook" || platform === "instagram" || platform === "threads" || platform === "x";
}

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
    threadsAccessToken: "",
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

  if (!isBrowserLoginPlatform(draft.platform)) {
    const configResult = parseJsonObject(draft.configText, "Config JSON");
    if (configResult.error) errors.configText = configResult.error;

    const credentialsResult = parseJsonObject(draft.credentialsText, "Credentials JSON");
    if (credentialsResult.error) errors.credentialsText = credentialsResult.error;
  }

  if (draft.platform === "telegram") {
    if (!draft.telegramApiId.trim()) errors.telegramApiId = "apiId là bắt buộc.";
    if (!draft.telegramApiHash.trim()) errors.telegramApiHash = "apiHash là bắt buộc.";
    if (!draft.telegramSession.trim()) errors.telegramSession = "Session string là bắt buộc.";
  }

  return errors;
}

export function buildAccountPayload(draft: AccountDraft): AccountFormValues {
  const config = isBrowserLoginPlatform(draft.platform) ? {} : parseJsonObject(draft.configText, "Config JSON").value ?? {};
  const extraCredentials = isBrowserLoginPlatform(draft.platform) ? {} : parseJsonObject(draft.credentialsText, "Credentials JSON").value ?? {};

  let platformCredentials: Record<string, unknown> = {};

  if (isBrowserLoginPlatform(draft.platform)) {
    platformCredentials = {};
  }

  if (draft.platform === "telegram") {
    platformCredentials = {
      apiId: draft.telegramApiId.trim(),
      apiHash: draft.telegramApiHash.trim(),
      session: draft.telegramSession.trim(),
      ...(draft.telegramPhone.trim() ? { phone: draft.telegramPhone.trim() } : {})
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
  if (draft.platform === "telegram") return <TelegramAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
  if (draft.platform === "x") return <XAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
  return (
    <InlineNote tone="info">
      <span>
        Tài khoản {draft.platform} đăng nhập qua trình duyệt riêng sau khi lưu. Không cần nhập thêm thông tin.
      </span>
    </InlineNote>
  );
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
  onSubmit
}: {
  label: string;
  description?: string;
  submitLabel?: string;
  fixedKind: AccountKind;
  defaultPlatform?: AccountPlatform;
  isSubmitting?: boolean;
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
    try {
      await onSubmit(buildAccountPayload(draft));
      setDraft(createEmptyDraft(fixedKind, draft.platform));
      setErrors({});
    } catch {
      // Submit errors are shown through toast notifications by the caller.
    }
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
        <strong>{helpTitle}.</strong> Nếu cần tạo theo nhiều bước, dùng trang <em>Quản lý tài khoản</em> để thao tác tập trung hơn.
      </InlineNote>

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
