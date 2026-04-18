import { CheckCircle2, Layers3, Plus, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
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
  validateDraft
} from "../../pages/accountForms";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { FacebookAccountForm } from "./FacebookAccountForm";
import { TelegramAccountForm } from "./TelegramAccountForm";
import { XAccountForm } from "./XAccountForm";
import { ThreadsAccountForm } from "./ThreadsAccountForm";
import { InstagramAccountForm } from "./InstagramAccountForm";
import { Textarea } from "../ui/Textarea";

type Props = {
  open: boolean;
  onClose: () => void;
  sourceMutation: UseMutationResult<any, Error, any, unknown>;
  targetMutation: UseMutationResult<any, Error, any, unknown>;
  targetOnly?: boolean;
};

export function AddAccountDialog({ open, onClose, sourceMutation, targetMutation, targetOnly = false }: Props) {
  const [step, setStep] = useState(targetOnly ? 2 : 1);
  const [draft, setDraft] = useState<AccountDraft>(() => createEmptyDraft("target", "facebook"));
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");

  const activeMutation = draft.kind === "source" ? sourceMutation : targetMutation;
  const isSubmitting = sourceMutation?.isPending || targetMutation?.isPending;
  const kindChoices = targetOnly ? ACCOUNT_KIND_OPTIONS.filter((option) => option.value === "target") : ACCOUNT_KIND_OPTIONS;

  const stepTitle = useMemo(() => {
    if (!targetOnly && step === 1) return "Bước 1 • Chọn loại tài khoản";
    if ((targetOnly && step === 2) || (!targetOnly && step === 2)) return "Bước 2 • Chọn nền tảng";
    return "Bước 3 • Nhập thông tin chi tiết";
  }, [step, targetOnly]);

  function resetWizard(kind: AccountKind = "target", platform: AccountPlatform = "facebook") {
    setStep(targetOnly ? 2 : 1);
    setDraft(createEmptyDraft(kind, platform));
    setErrors({});
    setSuccessMessage("");
  }

  function closeDialog() {
    if (!isSubmitting) {
      resetWizard();
      onClose();
    }
  }

  async function submit() {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStep(3);
      return;
    }

    try {
      await activeMutation.mutateAsync(buildAccountPayload(draft));
      setSuccessMessage(`Đã tạo tài khoản ${draft.kind === "source" ? "nguồn" : "đích"} cho ${draft.platform}.`);
      setErrors({});
      setDraft(createEmptyDraft(draft.kind, draft.platform));
      setStep(targetOnly ? 2 : 1);
    } catch {
      // handled by mutation.error
    }
  }

  function renderPlatformForm() {
    if (draft.platform === "facebook") return <FacebookAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
    if (draft.platform === "telegram") return <TelegramAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
    if (draft.platform === "x") return <XAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
    if (draft.platform === "threads") return <ThreadsAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
    return <InstagramAccountForm draft={draft} errors={errors} setDraft={setDraft} />;
  }

  return (
    <Dialog open={open} onClose={closeDialog} title={targetOnly ? "Thêm tài khoản đăng" : "Thêm tài khoản mới"}>
      <div className="wizard-shell">
        <div className="wizard-steps">
          {!targetOnly ? (
            <div className={`wizard-step ${1 <= step ? "active" : ""}`}>
              <span>1</span>
              <strong>Loại</strong>
            </div>
          ) : null}
          <div className={`wizard-step ${(targetOnly ? 2 : 2) <= step ? "active" : ""}`}>
            <span>{targetOnly ? 1 : 2}</span>
            <strong>Nền tảng</strong>
          </div>
          <div className={`wizard-step ${3 <= step ? "active" : ""}`}>
            <span>{targetOnly ? 2 : 3}</span>
            <strong>Chi tiết</strong>
          </div>
        </div>

        <div className="panel panel-pad wizard-body">
          <div className="wizard-headline">
            <div>
              <h3>{stepTitle}</h3>
              <p className="muted-copy">Flow tập trung để thêm account nhanh theo style nhiều bước.</p>
            </div>
            <Layers3 aria-hidden size={18} />
          </div>

          {successMessage ? (
            <div className="field-success" role="status">
              <CheckCircle2 aria-hidden size={14} />
              <span>{successMessage}</span>
            </div>
          ) : null}

          {activeMutation?.error?.message ? <FormError message={activeMutation.error.message} /> : null}

          {!targetOnly && step === 1 ? (
            <div className="choice-grid">
              {kindChoices.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`choice-card ${draft.kind === option.value ? "active" : ""}`}
                  onClick={() => {
                    setDraft((current) => ({ ...current, kind: option.value }));
                    setStep(2);
                  }}
                >
                  <div className="choice-title">
                    <ShieldAlert aria-hidden size={16} />
                    <span>{option.label}</span>
                  </div>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="choice-grid">
              {PLATFORM_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`choice-card ${draft.platform === option.value ? "active" : ""}`}
                  onClick={() => {
                    setDraft((current) => ({ ...current, kind: "target", platform: option.value }));
                    setStep(3);
                  }}
                >
                  <div className="choice-title">
                    {option.icon}
                    <span>{option.label}</span>
                  </div>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="wizard-form-stack">
              <InlineNote>
                <Plus aria-hidden size={14} />
                <span>
                  Đang tạo <strong>{draft.kind === "source" ? "tài khoản nguồn" : "tài khoản đăng"}</strong> cho nền tảng <strong>{draft.platform}</strong>.
                </span>
              </InlineNote>

              <div className="form-grid">
                <div className="field">
                  <Label htmlFor="dialog-name">Tên hiển thị</Label>
                  <Input id="dialog-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Facebook Page bán hàng" />
                  <FormError message={errors.name} />
                </div>
                <div className="field">
                  <Label htmlFor="dialog-handle">Handle / URL</Label>
                  <Input id="dialog-handle" value={draft.handle} onChange={(event) => setDraft((current) => ({ ...current, handle: event.target.value }))} placeholder="https://facebook.com/... hoặc @username" />
                  <FormError message={errors.handle} />
                </div>
              </div>

              {renderPlatformForm()}

              <div className="form-grid">
                <div className="field full">
                  <Label htmlFor="dialog-credentials">Credentials JSON bổ sung</Label>
                  <Textarea id="dialog-credentials" value={draft.credentialsText} onChange={(event) => setDraft((current) => ({ ...current, credentialsText: event.target.value }))} />
                  <FormError message={errors.credentialsText} />
                </div>
                <div className="field full">
                  <Label htmlFor="dialog-config">Config JSON</Label>
                  <Textarea id="dialog-config" value={draft.configText} onChange={(event) => setDraft((current) => ({ ...current, configText: event.target.value }))} />
                  <FormError message={errors.configText} />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="actions wizard-actions">
          <Button type="button" variant="ghost" onClick={() => (step <= (targetOnly ? 2 : 1) ? closeDialog() : setStep((current) => Math.max(targetOnly ? 2 : 1, current - 1)))} disabled={isSubmitting}>
            {step <= (targetOnly ? 2 : 1) ? "Đóng" : "Quay lại"}
          </Button>
          {step < 3 ? (
            <Button type="button" onClick={() => setStep((current) => Math.min(3, current + 1))}>
              Tiếp tục
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => resetWizard(draft.kind, draft.platform)} disabled={isSubmitting}>
                Reset wizard
              </Button>
              <Button type="button" onClick={submit} disabled={isSubmitting}>
                {isSubmitting ? "Đang tạo..." : "Lưu tài khoản"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
