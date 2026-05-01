import { KeyRound } from "lucide-react";
import type { PlatformFieldsProps } from "../../pages/accountForms";
import { FormError, InlineNote } from "../../pages/accountForms";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Textarea } from "../ui/Textarea";

export function TelegramAccountForm({ draft, errors, setDraft }: PlatformFieldsProps) {
  return (
    <>
      <InlineNote tone="info">
        <KeyRound aria-hidden size={14} />
        <span>
          Vào <code>my.telegram.org</code>, đăng nhập số điện thoại, mở <strong>API development tools</strong> để
          lấy API ID và API Hash. Session string tạo một lần bằng công cụ MTProto, rồi dán vào đây.
        </span>
      </InlineNote>
      <div className="form-grid">
        <div className="field">
          <Label htmlFor="telegram-api-id">API ID</Label>
          <Input
            id="telegram-api-id"
            value={draft.telegramApiId}
            onChange={(e) => setDraft((c) => ({ ...c, telegramApiId: e.target.value }))}
            placeholder="123456"
          />
          <FormError message={errors.telegramApiId} />
        </div>
        <div className="field">
          <Label htmlFor="telegram-api-hash">API Hash</Label>
          <Input
            id="telegram-api-hash"
            value={draft.telegramApiHash}
            onChange={(e) => setDraft((c) => ({ ...c, telegramApiHash: e.target.value }))}
            placeholder="0123456789abcdef"
          />
          <FormError message={errors.telegramApiHash} />
        </div>
        <div className="field full">
          <Label htmlFor="telegram-phone">
            Số điện thoại <span className="muted-copy">(tuỳ chọn)</span>
          </Label>
          <Input
            id="telegram-phone"
            value={draft.telegramPhone}
            onChange={(e) => setDraft((c) => ({ ...c, telegramPhone: e.target.value }))}
            placeholder="+8490xxxxxxx"
          />
        </div>
        <div className="field full">
          <Label htmlFor="telegram-session">Session string</Label>
          <Textarea
            id="telegram-session"
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
    </>
  );
}
