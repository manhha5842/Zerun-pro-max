import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Cloud, Link2, Save, Send } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";

type TabKey = "ai" | "cloudinary" | "affiliate" | "telegram";
type TelegramSettings = { botToken: string; chatId: string; enabled: boolean };
type AiSettings = { provider: string; apiKey: string; model: string; rewritePrompt: string; removeInvalidLinkPrompt: string };
type CloudinarySettings = { enabled: boolean; keys: Array<{ cloudName: string; apiKey: string; apiSecret: string; priority: number; enabled: boolean }> };
type AffiliateSettings = { networks: string[]; unknownLinkAction: string };

const tabs: Array<{ key: TabKey; label: string; description: string; icon: ReactNode }> = [
  { key: "ai", label: "AI", description: "Provider, API key, model và prompt", icon: <Bot aria-hidden /> },
  { key: "cloudinary", label: "Cloudinary", description: "Key pool và fallback quota", icon: <Cloud aria-hidden /> },
  { key: "affiliate", label: "Affiliate", description: "Network và rule link", icon: <Link2 aria-hidden /> },
  { key: "telegram", label: "Telegram", description: "Thông báo hệ thống", icon: <Send aria-hidden /> }
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("ai");
  const telegramQuery = useQuery({ queryKey: ["settings", "telegram"], queryFn: () => apiGet<TelegramSettings>("/settings/telegram") });
  const aiQuery = useQuery({ queryKey: ["settings", "ai"], queryFn: () => apiGet<AiSettings>("/settings/ai") });
  const cloudinaryQuery = useQuery({ queryKey: ["settings", "cloudinary"], queryFn: () => apiGet<CloudinarySettings>("/settings/cloudinary") });
  const affiliateQuery = useQuery({ queryKey: ["settings", "affiliate"], queryFn: () => apiGet<AffiliateSettings>("/settings/affiliate") });

  const [telegram, setTelegram] = useState<TelegramSettings>({ botToken: "", chatId: "", enabled: false });
  const [ai, setAi] = useState<AiSettings>({ provider: "", apiKey: "", model: "", rewritePrompt: "", removeInvalidLinkPrompt: "" });
  const [cloudinaryEnabled, setCloudinaryEnabled] = useState(true);
  const [cloudinaryJson, setCloudinaryJson] = useState("[]");
  const [affiliate, setAffiliate] = useState<AffiliateSettings>({ networks: ["shopee", "lazada"], unknownLinkAction: "saved_for_review" });
  const [testText, setTestText] = useState("Nội dung tiếng Việt có dấu cần viết lại và gỡ link không hợp lệ.");
  const [testOutput, setTestOutput] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => { if (telegramQuery.data) setTelegram(telegramQuery.data); }, [telegramQuery.data]);
  useEffect(() => { if (aiQuery.data) setAi(aiQuery.data); }, [aiQuery.data]);
  useEffect(() => {
    if (cloudinaryQuery.data) {
      setCloudinaryEnabled(Boolean(cloudinaryQuery.data.enabled));
      setCloudinaryJson(JSON.stringify(cloudinaryQuery.data.keys ?? [], null, 2));
    }
  }, [cloudinaryQuery.data]);
  useEffect(() => { if (affiliateQuery.data) setAffiliate(affiliateQuery.data); }, [affiliateQuery.data]);

  const saveTelegram = useMutation({ mutationFn: () => apiPut("/settings/telegram", telegram), onSuccess: () => setSavedMessage("Đã lưu cấu hình Telegram.") });
  const saveAi = useMutation({ mutationFn: () => apiPut("/settings/ai", ai), onSuccess: () => setSavedMessage("Đã lưu cấu hình AI.") });
  const saveCloudinary = useMutation({
    mutationFn: () => apiPut("/settings/cloudinary", { enabled: cloudinaryEnabled, keys: JSON.parse(cloudinaryJson || "[]") }),
    onSuccess: () => setSavedMessage("Đã lưu cấu hình Cloudinary.")
  });
  const saveAffiliate = useMutation({ mutationFn: () => apiPut("/settings/affiliate", affiliate), onSuccess: () => setSavedMessage("Đã lưu cấu hình Affiliate.") });
  const testAi = useMutation({
    mutationFn: () => apiPost<{ output: string }>("/settings/ai/test", { ...ai, text: testText }),
    onSuccess: (data) => setTestOutput(data.output)
  });

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Cấu hình hệ thống theo từng mục. Chọn nhóm ở menu trái, chỉnh input ở khung bên phải." />
      {savedMessage ? <div className="inline-alert">{savedMessage}</div> : null}

      <div className="settings-layout">
        <aside className="settings-menu">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}>
              {tab.icon}
              <span>
                <strong>{tab.label}</strong>
                <small>{tab.description}</small>
              </span>
            </button>
          ))}
        </aside>

        <SectionCard>
          {activeTab === "ai" ? (
            <div className="form-grid">
              <label>
                <Label>Provider</Label>
                <Input value={ai.provider} onChange={(event) => setAi((current) => ({ ...current, provider: event.target.value }))} placeholder="openai / anthropic / local" />
              </label>
              <label>
                <Label>Model</Label>
                <Input value={ai.model} onChange={(event) => setAi((current) => ({ ...current, model: event.target.value }))} placeholder="gpt-5.4" />
              </label>
              <label className="span-2">
                <Label>API key</Label>
                <Input type="password" value={ai.apiKey} onChange={(event) => setAi((current) => ({ ...current, apiKey: event.target.value }))} />
              </label>
              <label className="span-2">
                <Label>Prompt rewrite mặc định</Label>
                <Textarea value={ai.rewritePrompt} onChange={(event) => setAi((current) => ({ ...current, rewritePrompt: event.target.value }))} />
              </label>
              <label className="span-2">
                <Label>Prompt xóa link không hợp lệ</Label>
                <Textarea value={ai.removeInvalidLinkPrompt} onChange={(event) => setAi((current) => ({ ...current, removeInvalidLinkPrompt: event.target.value }))} />
              </label>
              <label className="span-2">
                <Label>Test prompt</Label>
                <Textarea value={testText} onChange={(event) => setTestText(event.target.value)} />
              </label>
              <div className="span-2 actions">
                <Button icon={<Save aria-hidden />} onClick={() => saveAi.mutate()}>Lưu AI</Button>
                <Button variant="secondary" onClick={() => testAi.mutate()}>Test prompt</Button>
              </div>
              {testOutput ? <Textarea className="span-2" readOnly value={testOutput} /> : null}
            </div>
          ) : null}

          {activeTab === "cloudinary" ? (
            <div className="form-grid">
              <label>
                <Label>Trạng thái</Label>
                <Select value={cloudinaryEnabled ? "true" : "false"} onChange={(event) => setCloudinaryEnabled(event.target.value === "true")}>
                  <option value="true">Đang bật</option>
                  <option value="false">Đang tắt</option>
                </Select>
              </label>
              <label className="span-2">
                <Label>Danh sách key JSON</Label>
                <Textarea value={cloudinaryJson} onChange={(event) => setCloudinaryJson(event.target.value)} />
              </label>
              <div className="span-2 actions">
                <Button icon={<Save aria-hidden />} onClick={() => saveCloudinary.mutate()}>Lưu Cloudinary</Button>
              </div>
            </div>
          ) : null}

          {activeTab === "affiliate" ? (
            <div className="form-grid">
              <label>
                <Label>Network hỗ trợ</Label>
                <Input value={affiliate.networks.join(", ")} onChange={(event) => setAffiliate((current) => ({ ...current, networks: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} />
              </label>
              <label>
                <Label>Link chưa hỗ trợ</Label>
                <Select value={affiliate.unknownLinkAction} onChange={(event) => setAffiliate((current) => ({ ...current, unknownLinkAction: event.target.value }))}>
                  <option value="saved_for_review">Đưa vào Kho lưu trữ</option>
                  <option value="remove">Xóa đoạn chứa link</option>
                  <option value="keep">Giữ nguyên</option>
                </Select>
              </label>
              <div className="span-2 actions">
                <Button icon={<Save aria-hidden />} onClick={() => saveAffiliate.mutate()}>Lưu Affiliate</Button>
              </div>
            </div>
          ) : null}

          {activeTab === "telegram" ? (
            <div className="form-grid">
              <label className="checkbox-row">
                <input type="checkbox" checked={telegram.enabled} onChange={(event) => setTelegram((current) => ({ ...current, enabled: event.target.checked }))} />
                <span>Bật nhận thông báo Telegram</span>
              </label>
              <label>
                <Label>Bot Token</Label>
                <Input value={telegram.botToken} onChange={(event) => setTelegram((current) => ({ ...current, botToken: event.target.value }))} />
              </label>
              <label>
                <Label>Chat ID</Label>
                <Input value={telegram.chatId} onChange={(event) => setTelegram((current) => ({ ...current, chatId: event.target.value }))} />
              </label>
              <div className="span-2 actions">
                <Button icon={<Save aria-hidden />} onClick={() => saveTelegram.mutate()}>Lưu Telegram</Button>
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}
