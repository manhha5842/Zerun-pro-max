import { KeySquare, Twitter } from "lucide-react";
import type { PlatformFieldsProps } from "../../pages/accountForms";
import { FormError, InlineNote } from "../../pages/accountForms";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

export function XAccountForm({ draft, errors, setDraft }: PlatformFieldsProps) {
  return (
    <section className="panel panel-pad account-platform-panel">
      <div className="account-platform-header">
        <div>
          <h3>X / Twitter credentials</h3>
          <p className="muted-copy">Chuẩn bị username, password, email xác minh và 2FA secret nếu tài khoản bật xác thực hai lớp.</p>
        </div>
        <Twitter aria-hidden size={18} />
      </div>
      <div className="form-grid">
        <div className="field">
          <Label htmlFor="x-username">Username</Label>
          <Input id="x-username" value={draft.xUsername} onChange={(event) => setDraft((current) => ({ ...current, xUsername: event.target.value }))} placeholder="@brand_account" />
          <FormError message={errors.xUsername} />
        </div>
        <div className="field">
          <Label htmlFor="x-email">Email</Label>
          <Input id="x-email" type="email" value={draft.xEmail} onChange={(event) => setDraft((current) => ({ ...current, xEmail: event.target.value }))} placeholder="ops@example.com" />
          <FormError message={errors.xEmail} />
        </div>
        <div className="field">
          <Label htmlFor="x-password">Password</Label>
          <Input id="x-password" type="password" value={draft.xPassword} onChange={(event) => setDraft((current) => ({ ...current, xPassword: event.target.value }))} placeholder="••••••••" />
          <FormError message={errors.xPassword} />
        </div>
        <div className="field">
          <Label htmlFor="x-2fa">2FA secret (tuỳ chọn)</Label>
          <Input id="x-2fa" value={draft.xTwoFactorSecret} onChange={(event) => setDraft((current) => ({ ...current, xTwoFactorSecret: event.target.value }))} placeholder="JBSWY3DPEHPK3PXP" />
        </div>
      </div>
      <InlineNote tone="warning">
        <KeySquare aria-hidden size={14} />
        <span>Thông tin nhạy cảm sẽ được gửi vào trường credentials JSON của backend. Cân nhắc mã hóa ở tầng lưu trữ nếu cần.</span>
      </InlineNote>
    </section>
  );
}
