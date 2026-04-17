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
          <p className="muted-copy">Dùng cho page, profile hoặc group. Hệ thống cần session Playwright đã đăng nhập sẵn.</p>
        </div>
        <FolderLock aria-hidden size={18} />
      </div>

      <InlineNote tone="warning">
        <Info aria-hidden size={14} />
        <div>
          <strong>Cách chuẩn bị session Facebook:</strong>
          <ol className="note-list">
            <li>Mở browser Playwright/persistent context và đăng nhập Facebook thủ công 1 lần.</li>
            <li>Lưu session vào thư mục ví dụ <code>storage/sessions/facebook/account-name</code>.</li>
            <li>Nhập đường dẫn đó vào <strong>authPath</strong> hoặc <strong>sessionDir</strong>.</li>
            <li>Nếu bạn dùng storage state JSON riêng, có thể ghi rõ trong credentials/config bổ sung.</li>
          </ol>
        </div>
      </InlineNote>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field full">
          <Label htmlFor="facebook-auth-path">authPath</Label>
          <Input
            id="facebook-auth-path"
            value={draft.authPath}
            onChange={(event) => setDraft((current) => ({ ...current, authPath: event.target.value }))}
            placeholder="storage/sessions/facebook/page-a/state.json hoặc thư mục session"
          />
          <small className="field-help">Dùng khi backend đọc trực tiếp authPath trong credentials.</small>
          <FormError message={errors.authPath} />
        </div>
        <div className="field full">
          <Label htmlFor="facebook-session-dir">sessionDir</Label>
          <Input
            id="facebook-session-dir"
            value={draft.sessionDir}
            onChange={(event) => setDraft((current) => ({ ...current, sessionDir: event.target.value }))}
            placeholder="storage/sessions/facebook/account-name"
          />
          <small className="field-help">Dùng cho Playwright persistent context. Chỉ cần authPath hoặc sessionDir.</small>
          <FormError message={errors.sessionDir} />
        </div>
      </div>

      <InlineNote tone="success">
        <ExternalLink aria-hidden size={14} />
        <span>Mẹo: với tài khoản Facebook dùng để đăng bài, hãy tạo riêng từng thư mục session để tránh ghi đè cookie giữa các account.</span>
      </InlineNote>
    </section>
  );
}
