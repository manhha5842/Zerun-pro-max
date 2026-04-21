import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { apiGet, apiPut } from "../api/client";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";

type TelegramSettings = {
  botToken: string;
  chatId: string;
  enabled: boolean;
};

export function SettingsPage() {
  const ai = useQuery({ queryKey: ["ai-configs"], queryFn: () => apiGet<{ configs: Array<any> }>("/ai/configs") });
  const telegramQuery = useQuery<TelegramSettings>({
    queryKey: ["telegram-settings"],
    queryFn: () => apiGet("/settings/telegram")
  });

  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (telegramQuery.data) {
      setBotToken(telegramQuery.data.botToken ?? "");
      setChatId(telegramQuery.data.chatId ?? "");
      setEnabled(telegramQuery.data.enabled ?? false);
    }
  }, [telegramQuery.data]);

  async function saveTelegram() {
    try {
      setSaving(true);
      await apiPut("/settings/telegram", { botToken, chatId, enabled });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Quản lý cấu hình AI và thông báo hệ thống." />

      <SectionCard title="Cấu hình AI" description="Các cấu hình đã lưu trong hệ thống.">
        {(ai.data?.configs ?? []).length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13 }}>Chưa có cấu hình AI nào.</div>
        ) : (
          <table className="table table-compact">
            <tbody>
              {(ai.data?.configs ?? []).map((config) => (
                <tr key={config.id}>
                  <td>{config.provider}</td>
                  <td>{config.name}</td>
                  <td>{config.isActive ? "Đang bật" : "Đã tắt"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Thông báo Telegram" description="Nhận thông báo khi đăng bài thành công hoặc thất bại qua Telegram bot.">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input id="tg-enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
            <Label htmlFor="tg-enabled">Bật nhận thông báo Telegram</Label>
          </div>

          <div>
            <Label htmlFor="tg-token">Bot Token</Label>
            <Input id="tg-token" type="text" placeholder="123456789:ABCdef..." value={botToken} onChange={(e) => setBotToken(e.target.value)} />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Lấy token từ @BotFather trên Telegram.</div>
          </div>

          <div>
            <Label htmlFor="tg-chatid">Chat ID</Label>
            <Input id="tg-chatid" type="text" placeholder="-100123456789" value={chatId} onChange={(e) => setChatId(e.target.value)} />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Chat ID của bạn hoặc nhóm sẽ nhận thông báo.</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Button icon={<Save size={14} />} disabled={saving} onClick={saveTelegram}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
            {saved && <span style={{ fontSize: 13, color: "#16a34a" }}>Lưu thành công.</span>}
          </div>
        </div>
      </SectionCard>
    </>
  );
}
