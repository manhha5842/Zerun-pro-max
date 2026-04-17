import { MessageCircleMore, TimerReset } from "lucide-react";
import type { PlatformFieldsProps } from "../../pages/accountForms";
import { FormError, InlineNote } from "../../pages/accountForms";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

export function ThreadsAccountForm({ draft, errors, setDraft }: PlatformFieldsProps) {
  return (
    <section className="panel panel-pad account-platform-panel">
      <div className="account-platform-header">
        <div>
          <h3>Threads / Instagram bridge</h3>
          <p className="muted-copy">Hỗ trợ sessionDir hoặc fallback bằng tài khoản Instagram liên kết.</p>
        </div>
        <MessageCircleMore aria-hidden size={18} />
      </div>
      <div className="form-grid">
        <div className="field full">
          <Label htmlFor="threads-session-dir">sessionDir</Label>
          <Input id="threads-session-dir" value={draft.threadsSessionDir} onChange={(event) => setDraft((current) => ({ ...current, threadsSessionDir: event.target.value }))} placeholder="storage/sessions/threads/account-a" />
          <small className="field-help">Nếu có sessionDir hợp lệ, username/password có thể để trống.</small>
          <FormError message={errors.threadsSessionDir} />
        </div>
        <div className="field">
          <Label htmlFor="threads-username">Instagram username</Label>
          <Input id="threads-username" value={draft.threadsUsername} onChange={(event) => setDraft((current) => ({ ...current, threadsUsername: event.target.value }))} placeholder="insta.ops" />
          <FormError message={errors.threadsUsername} />
        </div>
        <div className="field">
          <Label htmlFor="threads-password">Instagram password</Label>
          <Input id="threads-password" type="password" value={draft.threadsPassword} onChange={(event) => setDraft((current) => ({ ...current, threadsPassword: event.target.value }))} placeholder="••••••••" />
          <FormError message={errors.threadsPassword} />
        </div>
      </div>
      <InlineNote>
        <TimerReset aria-hidden size={14} />
        <span>Threads thường thay đổi session nhanh; sessionDir ổn định hơn so với đăng nhập lại liên tục bằng password.</span>
      </InlineNote>
    </section>
  );
}
