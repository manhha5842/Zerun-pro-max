import {
  AlertCircle,
  CheckCircle2,
  Facebook,
  Globe,
  Instagram,
  KeyRound,
  Layers3,
  MessageCircle,
  ShieldAlert,
  Twitter,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";
import {
  ACCOUNT_KIND_OPTIONS,
  PLATFORM_OPTIONS,
  buildAccountPayload,
  createEmptyDraft,
  FormError,
  InlineNote,
  type AccountDraft,
  type AccountKind,
  type AccountPlatform,
  type FormErrors,
  isBrowserLoginPlatform,
  validateDraft,
} from "../../pages/accountForms";

type WizardStep = "kind" | "platform" | "connect" | "test" | "name";

type Props = {
  open: boolean;
  onClose: () => void;
  sourceMutation?: UseMutationResult<any, Error, any, unknown>;
  targetMutation: UseMutationResult<any, Error, any, unknown>;
  targetOnly?: boolean;
};

const PLATFORM_LABELS: Record<AccountPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  x: "X / Twitter",
  telegram: "Telegram",
};

const STEP_LABELS: Record<WizardStep, string> = {
  kind: "Loại",
  platform: "Nền tảng",
  connect: "Kết nối",
  test: "Xác nhận",
  name: "Đặt tên",
};

function makeSteps(targetOnly: boolean): WizardStep[] {
  return targetOnly
    ? ["platform", "connect", "test", "name"]
    : ["kind", "platform", "connect", "test", "name"];
}

export function AddAccountDialog({ open, onClose, sourceMutation, targetMutation, targetOnly = false }: Props) {
  const toast = useToast();
  const steps = useMemo(() => makeSteps(targetOnly), [targetOnly]);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<AccountDraft>(() => createEmptyDraft("target", "facebook"));
  const [errors, setErrors] = useState<FormErrors>({});

  const currentStep = steps[stepIndex];
  const activeMutation = !targetOnly && draft.kind === "source" && sourceMutation ? sourceMutation : targetMutation;
  const isSubmitting = Boolean(sourceMutation?.isPending || targetMutation?.isPending);
  const platformLabel = PLATFORM_LABELS[draft.platform];

  function resetWizard() {
    setStepIndex(0);
    setDraft(createEmptyDraft("target", "facebook"));
    setErrors({});
  }

  function closeDialog() {
    if (!isSubmitting) {
      resetWizard();
      onClose();
    }
  }

  function goNext() {
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }

  function goBack() {
    if (stepIndex === 0) closeDialog();
    else setStepIndex((i) => i - 1);
  }

  async function submit() {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      await activeMutation.mutateAsync(buildAccountPayload(draft));
      toast.success(`Đã tạo tài khoản ${platformLabel}.`);
      resetWizard();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tạo tài khoản.");
    }
  }

  const stepCountClass = steps.length === 4 ? "four" : steps.length === 5 ? "five" : "";

  return (
    <Dialog open={open} onClose={closeDialog} title="Thêm tài khoản">
      <div className="wizard-shell">
        <div className={`wizard-steps ${stepCountClass}`}>
          {steps.map((step, index) => (
            <button
              key={step}
              type="button"
              className={`wizard-step ${index <= stepIndex ? "active" : ""}`}
              onClick={() => { if (index < stepIndex && !isSubmitting) setStepIndex(index); }}
              disabled={isSubmitting || index >= stepIndex}
            >
              <span>{index + 1}</span>
              <strong>{STEP_LABELS[step]}</strong>
            </button>
          ))}
        </div>

        <div className="panel panel-pad wizard-body">
          {currentStep === "kind" && (
            <KindStep
              draft={draft}
              onSelect={(kind) => {
                setDraft((c) => ({ ...c, kind }));
                goNext();
              }}
            />
          )}
          {currentStep === "platform" && (
            <PlatformStep
              draft={draft}
              onSelect={(platform) => {
                setDraft((c) => ({ ...c, platform, kind: targetOnly ? "target" : c.kind }));
                goNext();
              }}
            />
          )}
          {currentStep === "connect" && (
            isBrowserLoginPlatform(draft.platform)
              ? <BrowserConnectStep platform={draft.platform} platformLabel={platformLabel} />
              : <TelegramConnectStep draft={draft} errors={errors} setDraft={setDraft} />
          )}
          {currentStep === "test" && (
            <TestStep platform={draft.platform} platformLabel={platformLabel} draft={draft} />
          )}
          {currentStep === "name" && (
            <NameStep draft={draft} errors={errors} setDraft={setDraft} />
          )}
        </div>

        <div className="actions wizard-actions">
          <Button type="button" variant="ghost" onClick={goBack} disabled={isSubmitting}>
            {stepIndex === 0 ? "Đóng" : "Quay lại"}
          </Button>
          {currentStep !== "kind" && currentStep !== "platform" && currentStep !== "name" && (
            <Button type="button" onClick={goNext}>
              Tiếp tục
            </Button>
          )}
          {currentStep === "name" && (
            <Button type="button" onClick={submit} disabled={isSubmitting}>
              {isSubmitting ? "Đang lưu..." : "Lưu tài khoản"}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function KindStep({ draft, onSelect }: { draft: AccountDraft; onSelect: (kind: AccountKind) => void }) {
  return (
    <>
      <div className="wizard-headline">
        <div>
          <h3>Loại tài khoản</h3>
          <p className="muted-copy">Chọn mục đích sử dụng tài khoản này.</p>
        </div>
        <ShieldAlert aria-hidden size={18} />
      </div>
      <div className="choice-grid">
        {ACCOUNT_KIND_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`choice-card ${draft.kind === option.value ? "active" : ""}`}
            onClick={() => onSelect(option.value)}
          >
            <div className="choice-title">
              <ShieldAlert aria-hidden size={16} />
              <span>{option.label}</span>
            </div>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
    </>
  );
}

function PlatformStep({ draft, onSelect }: { draft: AccountDraft; onSelect: (platform: AccountPlatform) => void }) {
  return (
    <>
      <div className="wizard-headline">
        <div>
          <h3>Chọn nền tảng</h3>
          <p className="muted-copy">
            Facebook, Instagram, Threads và X đăng nhập qua trình duyệt. Telegram dùng API key và session string.
          </p>
        </div>
        <Layers3 aria-hidden size={18} />
      </div>
      <div className="choice-grid">
        {PLATFORM_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`choice-card ${draft.platform === option.value ? "active" : ""}`}
            onClick={() => onSelect(option.value)}
          >
            <div className="choice-title">
              {option.icon}
              <span>{option.label}</span>
            </div>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
    </>
  );
}

const BROWSER_PLATFORM_ICONS: Record<string, React.ReactNode> = {
  facebook: <Facebook size={28} />,
  instagram: <Instagram size={28} />,
  threads: <MessageCircle size={28} />,
  x: <Twitter size={28} />,
};

function BrowserConnectStep({ platform, platformLabel }: { platform: AccountPlatform; platformLabel: string }) {
  return (
    <div className="wizard-connect">
      <div className="wizard-connect-icon">{BROWSER_PLATFORM_ICONS[platform]}</div>
      <h3>Đăng nhập {platformLabel} qua trình duyệt</h3>
      <p className="muted-copy">
        Sau khi lưu tài khoản, Zerun tự động mở cửa sổ {platformLabel} riêng. Bạn đăng nhập trong cửa sổ đó —
        Zerun không lưu mật khẩu.
      </p>
      <ol className="browser-flow-steps">
        <li>Đặt tên và lưu tài khoản ở bước tiếp theo</li>
        <li>Zerun mở cửa sổ {platformLabel} riêng</li>
        <li>Đăng nhập bình thường trong cửa sổ đó</li>
        <li>Session được lưu tự động</li>
      </ol>
      <InlineNote tone="info">
        <Globe aria-hidden size={14} />
        <span>Mật khẩu không bao giờ đi qua Zerun. App chỉ lưu cookie/session sau khi bạn đăng nhập thành công.</span>
      </InlineNote>
    </div>
  );
}

function TelegramConnectStep({
  draft,
  errors,
  setDraft,
}: {
  draft: AccountDraft;
  errors: FormErrors;
  setDraft: React.Dispatch<React.SetStateAction<AccountDraft>>;
}) {
  return (
    <div className="wizard-connect">
      <h3>Nhập thông tin Telegram MTProto</h3>
      <p className="muted-copy">Dùng API ID, API Hash và session string để crawl hoặc publish.</p>
      <InlineNote tone="info">
        <KeyRound aria-hidden size={14} />
        <span>
          Vào <code>my.telegram.org</code>, đăng nhập số điện thoại, mở <strong>API development tools</strong> để
          lấy API ID và API Hash.
        </span>
      </InlineNote>
      <div className="form-grid">
        <div className="field">
          <Label htmlFor="tg-api-id">API ID</Label>
          <Input
            id="tg-api-id"
            value={draft.telegramApiId}
            onChange={(e) => setDraft((c) => ({ ...c, telegramApiId: e.target.value }))}
            placeholder="123456"
          />
          <FormError message={errors.telegramApiId} />
        </div>
        <div className="field">
          <Label htmlFor="tg-api-hash">API Hash</Label>
          <Input
            id="tg-api-hash"
            value={draft.telegramApiHash}
            onChange={(e) => setDraft((c) => ({ ...c, telegramApiHash: e.target.value }))}
            placeholder="0123456789abcdef"
          />
          <FormError message={errors.telegramApiHash} />
        </div>
        <div className="field full">
          <Label htmlFor="tg-phone">
            Số điện thoại <span className="muted-copy">(tuỳ chọn)</span>
          </Label>
          <Input
            id="tg-phone"
            value={draft.telegramPhone}
            onChange={(e) => setDraft((c) => ({ ...c, telegramPhone: e.target.value }))}
            placeholder="+8490xxxxxxx"
          />
        </div>
        <div className="field full">
          <Label htmlFor="tg-session">Session string</Label>
          <Textarea
            id="tg-session"
            value={draft.telegramSession}
            onChange={(e) => setDraft((c) => ({ ...c, telegramSession: e.target.value }))}
            placeholder="1AQA..."
          />
          <FormError message={errors.telegramSession} />
        </div>
      </div>
      <InlineNote tone="warning">
        <KeyRound aria-hidden size={14} />
        <span>Không nhập mật khẩu Telegram vào đây. App chỉ cần API ID, API Hash và session string đã đăng nhập.</span>
      </InlineNote>
    </div>
  );
}

function TestStep({
  platform,
  platformLabel,
  draft,
}: {
  platform: AccountPlatform;
  platformLabel: string;
  draft: AccountDraft;
}) {
  if (isBrowserLoginPlatform(platform)) {
    return (
      <div className="wizard-test">
        <CheckCircle2 className="test-status-icon ok" aria-hidden size={40} />
        <h3>Sẵn sàng kết nối</h3>
        <p className="muted-copy">
          Tài khoản {platformLabel} sẽ mở trình duyệt để đăng nhập ngay sau khi lưu.
          <br />
          Bấm <strong>Tiếp tục</strong> để đặt tên và lưu tài khoản.
        </p>
      </div>
    );
  }

  const telegramReady =
    draft.telegramApiId.trim() && draft.telegramApiHash.trim() && draft.telegramSession.trim();

  return (
    <div className="wizard-test">
      {telegramReady ? (
        <>
          <CheckCircle2 className="test-status-icon ok" aria-hidden size={40} />
          <h3>Thông tin hợp lệ</h3>
          <p className="muted-copy">
            API ID, API Hash và session string đã nhập. Bấm <strong>Tiếp tục</strong> để đặt tên tài khoản.
          </p>
        </>
      ) : (
        <>
          <AlertCircle className="test-status-icon warn" aria-hidden size={40} />
          <h3>Thiếu thông tin</h3>
          <p className="muted-copy">
            Quay lại bước trước để nhập đầy đủ API ID, API Hash và session string.
          </p>
        </>
      )}
    </div>
  );
}

function NameStep({
  draft,
  errors,
  setDraft,
}: {
  draft: AccountDraft;
  errors: FormErrors;
  setDraft: React.Dispatch<React.SetStateAction<AccountDraft>>;
}) {
  return (
    <div className="wizard-name">
      <h3>Đặt tên tài khoản</h3>
      <p className="muted-copy">Tên giúp bạn nhận ra tài khoản trong danh sách.</p>
      <div className="form-grid">
        <div className="field full">
          <Label htmlFor="account-name">Tên hiển thị</Label>
          <Input
            id="account-name"
            value={draft.name}
            onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
            placeholder="Ví dụ: Page bán hàng"
            autoFocus
          />
          <FormError message={errors.name} />
        </div>
        <div className="field full">
          <Label htmlFor="account-handle">
            Handle hoặc URL <span className="muted-copy">(tuỳ chọn)</span>
          </Label>
          <Input
            id="account-handle"
            value={draft.handle}
            onChange={(e) => setDraft((c) => ({ ...c, handle: e.target.value }))}
            placeholder="@username hoặc URL"
          />
          <FormError message={errors.handle} />
        </div>
      </div>
    </div>
  );
}
