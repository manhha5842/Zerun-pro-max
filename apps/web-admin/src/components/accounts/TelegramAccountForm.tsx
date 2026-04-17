import { KeyRound, Send } from "lucide-react";
import type { PlatformFieldsProps } from "../../pages/accountForms";
import { FormError, InlineNote } from "../../pages/accountForms";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Textarea } from "../ui/Textarea";

export function TelegramAccountForm({ draft, errors, setDraft }: PlatformFieldsProps) {
  return (
    <section className="panel panel-pad account-platform-panel">
      <div className="account-platform-header">
        <div>
          <h3>Telegram MTProto</h3>
          <p className="muted-copy">Dùng API ID/API Hash và session string để crawl hoặc publish.</p>
        </div>
        <Send aria-hidden size={18} />
      </div>
      <div className="form-grid">
        <div className="field">
          <Label htmlFor="telegram-api-id">API ID</Label>
          <Input id="telegram-api-id" value={draft.telegramApiId} onChange={(event) => setDraft((current) => ({ ...current, telegramApiId: event.target.value }))} placeholder="123456" />
          <FormError message={errors.telegramApiId} />
        </div>
        <div className="field">
          <Label htmlFor="telegram-api-hash">API Hash</Label>
          <Input id="telegram-api-hash" value={draft.telegramApiHash} onChange={(event) => setDraft((current) => ({ ...current, telegramApiHash: event.target.value }))} placeholder="0123456789abcdef" />
          <FormError message={errors.telegramApiHash} />
        </div>
        <div className="field full">
          <Label htmlFor="telegram-phone">Số điện thoại (tuỳ chọn)</Label>
          <Input id="telegram-phone" value={draft.telegramPhone} onChange={(event) => setDraft((current) => ({ ...current, telegramPhone: event.target.value }))} placeholder="+8490xxxxxxx" />
        </div>
        <div className="field full">
          <Label htmlFor="telegram-session">Session string</Label>
          <Textarea id="telegram-session" value={draft.telegramSession} onChange={(event) => setDraft((current) => ({ ...current, telegramSession: event.target.value }))} placeholder="1AQA..." />
          <FormError message={errors.telegramSession} />
        </div>
      </div>
      <InlineNote>
        <KeyRound aria-hidden size={14} />
        <span>Session string nên được tạo và kiểm tra bằng đúng thư viện Telegram mà worker đang sử dụng.</span>
      </InlineNote>
    </section>
  );
}
