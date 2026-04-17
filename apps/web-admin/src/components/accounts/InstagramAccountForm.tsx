import { Camera, Lock } from "lucide-react";
import type { PlatformFieldsProps } from "../../pages/accountForms";
import { FormError, InlineNote } from "../../pages/accountForms";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

export function InstagramAccountForm({ draft, errors, setDraft }: PlatformFieldsProps) {
  return (
    <section className="panel panel-pad account-platform-panel">
      <div className="account-platform-header">
        <div>
          <h3>Instagram login</h3>
          <p className="muted-copy">Dùng cho tài khoản Instagram cơ bản. Có thể bổ sung proxy hoặc device profile ở credentials/config JSON.</p>
        </div>
        <Camera aria-hidden size={18} />
      </div>
      <div className="form-grid">
        <div className="field">
          <Label htmlFor="instagram-username">Username</Label>
          <Input id="instagram-username" value={draft.instagramUsername} onChange={(event) => setDraft((current) => ({ ...current, instagramUsername: event.target.value }))} placeholder="my.brand" />
          <FormError message={errors.instagramUsername} />
        </div>
        <div className="field">
          <Label htmlFor="instagram-password">Password</Label>
          <Input id="instagram-password" type="password" value={draft.instagramPassword} onChange={(event) => setDraft((current) => ({ ...current, instagramPassword: event.target.value }))} placeholder="••••••••" />
          <FormError message={errors.instagramPassword} />
        </div>
      </div>
      <InlineNote tone="warning">
        <Lock aria-hidden size={14} />
        <span>Nếu tài khoản bật checkpoint/2FA, nên lưu thêm dữ liệu xác minh trong credentials JSON hoặc chuyển sang flow sessionDir nếu backend hỗ trợ.</span>
      </InlineNote>
    </section>
  );
}
