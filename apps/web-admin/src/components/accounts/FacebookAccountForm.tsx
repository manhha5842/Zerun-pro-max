import { ExternalLink, FolderLock, Info } from "lucide-react";
import type { PlatformFieldsProps } from "../../pages/accountForms";
import { FormError, InlineNote } from "../../pages/accountForms";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

export function FacebookAccountForm({ draft, errors, setDraft }: PlatformFieldsProps) {
  return (
    <section className="panel panel-pad account-platform-panel">
      <div className="account-platform-header">
        <div>
          <h3>Facebook session</h3>
          <p className="muted-copy">Các trường bên dưới là tùy chọn. Bạn có thể để trống rồi mở browser login sau khi tạo account.</p>
        </div>
        <FolderLock aria-hidden size={18} />
      </div>

      <InlineNote tone="info">
        <Info aria-hidden size={14} />
        <div>
          Sau khi tạo account xong, vào bảng tài khoản và bấm <strong>Mở trình duyệt đăng nhập</strong> hoặc <strong>Mở lại browser session</strong>.
        </div>
      </InlineNote>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field full">
          <Label htmlFor="facebook-auth-path">authPath</Label>
          <Input
            id="facebook-auth-path"
            value={draft.authPath}
            onChange={(event) => setDraft((current) => ({ ...current, authPath: event.target.value }))}
            placeholder="Để trống nếu sẽ login bằng browser sau khi tạo account"
          />
          <small className="field-help">Tùy chọn. Dùng khi bạn đã có sẵn file storage state JSON.</small>
          <FormError message={errors.authPath} />
        </div>
        <div className="field full">
          <Label htmlFor="facebook-session-dir">sessionDir</Label>
          <Input
            id="facebook-session-dir"
            value={draft.sessionDir}
            onChange={(event) => setDraft((current) => ({ ...current, sessionDir: event.target.value }))}
            placeholder="Để trống nếu sẽ login bằng browser sau khi tạo account"
          />
          <small className="field-help">Tùy chọn. Dùng cho Playwright persistent context nếu bạn đã có session folder sẵn.</small>
          <FormError message={errors.sessionDir} />
        </div>
      </div>

      <InlineNote tone="success">
        <ExternalLink aria-hidden size={14} />
        <span>Nếu một account Facebook đã đăng ổn định, nên giữ session riêng cho từng account để tránh ghi đè cookie.</span>
      </InlineNote>
    </section>
  );
}
