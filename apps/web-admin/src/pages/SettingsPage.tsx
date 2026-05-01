import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Cloud,
  Link2,
  Monitor,
  MoonStar,
  Save,
  Send,
  Sun,
  Server,
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import {
  applyTheme,
  getStoredThemePreference,
  getSystemTheme,
  setThemePreference,
  subscribeToSystemThemeChange,
  type ThemePreference,
} from "../lib/theme";

type TabKey =
  | "appearance"
  | "runtime"
  | "ai"
  | "cloudinary"
  | "affiliate"
  | "telegram";
type TelegramSettings = { botToken: string; chatId: string; enabled: boolean };
type AiSettings = {
  provider: string;
  apiKey: string;
  model: string;
  rewritePrompt: string;
  removeInvalidLinkPrompt: string;
};
type CloudinarySettings = {
  enabled: boolean;
  keys: Array<{
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    priority: number;
    enabled: boolean;
  }>;
};
type AffiliateSettings = { networks: string[]; unknownLinkAction: string };
type RuntimeSettings = {
  appId: string;
  appDataDir: string;
  configPath: string;
  dbPath: string;
  server: { port: number; host: string; exposeLan: boolean };
  tunnel: {
    enabled: boolean;
    provider: string;
    token: string;
    publicUrl: string;
  };
  storage: {
    mediaDir: string;
    uploadDir: string;
    facebookSessionDir: string;
    instagramSessionDir: string;
    threadsSessionDir: string;
    xSessionDir: string;
    logsDir: string;
  };
};

const tabs: Array<{
  key: TabKey;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    key: "appearance",
    label: "Giao diện",
    description: "Theme sáng, tối hoặc theo máy",
    icon: <MoonStar aria-hidden />,
  },
  {
    key: "runtime",
    label: "Desktop host",
    description: "Cổng web, AppData và tunnel",
    icon: <Server aria-hidden />,
  },
  {
    key: "ai",
    label: "AI",
    description: "Provider, API key, model và prompt",
    icon: <Bot aria-hidden />,
  },
  {
    key: "cloudinary",
    label: "Cloudinary",
    description: "Key pool và fallback quota",
    icon: <Cloud aria-hidden />,
  },
  {
    key: "affiliate",
    label: "Affiliate",
    description: "Network và rule link",
    icon: <Link2 aria-hidden />,
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "Thông báo hệ thống",
    icon: <Send aria-hidden />,
  },
];

export function SettingsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("appearance");
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    () => getStoredThemePreference(),
  );
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme());
  const runtimeQuery = useQuery({
    queryKey: ["settings", "runtime"],
    queryFn: () => apiGet<{ runtime: RuntimeSettings }>("/settings/runtime"),
  });
  const telegramQuery = useQuery({
    queryKey: ["settings", "telegram"],
    queryFn: () => apiGet<TelegramSettings>("/settings/telegram"),
  });
  const aiQuery = useQuery({
    queryKey: ["settings", "ai"],
    queryFn: () => apiGet<AiSettings>("/settings/ai"),
  });
  const cloudinaryQuery = useQuery({
    queryKey: ["settings", "cloudinary"],
    queryFn: () => apiGet<CloudinarySettings>("/settings/cloudinary"),
  });
  const affiliateQuery = useQuery({
    queryKey: ["settings", "affiliate"],
    queryFn: () => apiGet<AffiliateSettings>("/settings/affiliate"),
  });

  const [runtime, setRuntime] = useState<RuntimeSettings>({
    appId: "com.zerun.app",
    appDataDir: "",
    configPath: "",
    dbPath: "",
    server: { port: 3000, host: "127.0.0.1", exposeLan: false },
    tunnel: {
      enabled: false,
      provider: "cloudflare",
      token: "",
      publicUrl: "",
    },
    storage: {
      mediaDir: "",
      uploadDir: "",
      facebookSessionDir: "",
      instagramSessionDir: "",
      threadsSessionDir: "",
      xSessionDir: "",
      logsDir: "",
    },
  });
  const [telegram, setTelegram] = useState<TelegramSettings>({
    botToken: "",
    chatId: "",
    enabled: false,
  });
  const [ai, setAi] = useState<AiSettings>({
    provider: "",
    apiKey: "",
    model: "",
    rewritePrompt: "",
    removeInvalidLinkPrompt: "",
  });
  const [cloudinaryEnabled, setCloudinaryEnabled] = useState(true);
  const [cloudinaryJson, setCloudinaryJson] = useState("[]");
  const [affiliate, setAffiliate] = useState<AffiliateSettings>({
    networks: ["shopee", "lazada"],
    unknownLinkAction: "saved_for_review",
  });
  const [testText, setTestText] = useState(
    "Nội dung tiếng Việt có dấu cần viết lại và gỡ link không hợp lệ.",
  );
  const [testOutput, setTestOutput] = useState("");

  useEffect(() => {
    applyTheme(themePreference);
  }, [themePreference]);

  useEffect(() => subscribeToSystemThemeChange(setSystemTheme), []);

  useEffect(() => {
    if (themePreference === "system") {
      applyTheme("system");
    }
  }, [systemTheme, themePreference]);

  useEffect(() => {
    if (runtimeQuery.data?.runtime) setRuntime(runtimeQuery.data.runtime);
  }, [runtimeQuery.data]);
  useEffect(() => {
    if (telegramQuery.data) setTelegram(telegramQuery.data);
  }, [telegramQuery.data]);
  useEffect(() => {
    if (aiQuery.data) setAi(aiQuery.data);
  }, [aiQuery.data]);
  useEffect(() => {
    if (cloudinaryQuery.data) {
      setCloudinaryEnabled(Boolean(cloudinaryQuery.data.enabled));
      setCloudinaryJson(
        JSON.stringify(cloudinaryQuery.data.keys ?? [], null, 2),
      );
    }
  }, [cloudinaryQuery.data]);
  useEffect(() => {
    if (affiliateQuery.data) setAffiliate(affiliateQuery.data);
  }, [affiliateQuery.data]);

  const saveRuntime = useMutation({
    mutationFn: () =>
      apiPut<{
        saved: boolean;
        restartRequired: boolean;
        runtime: RuntimeSettings;
      }>("/settings/runtime", {
        server: runtime.server,
        tunnel: runtime.tunnel,
      }),
    onSuccess: (data) => {
      setRuntime(data.runtime);
      toast.success(
        data.restartRequired
          ? "Đã lưu Desktop host. Hãy khởi động lại app để áp dụng cổng mới."
          : "Đã lưu Desktop host.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveTelegram = useMutation({
    mutationFn: () => apiPut("/settings/telegram", telegram),
    onSuccess: () => toast.success("Đã lưu cấu hình Telegram."),
    onError: (error: Error) => toast.error(error.message),
  });
  const saveAi = useMutation({
    mutationFn: () => apiPut("/settings/ai", ai),
    onSuccess: () => toast.success("Đã lưu cấu hình AI."),
    onError: (error: Error) => toast.error(error.message),
  });
  const saveCloudinary = useMutation({
    mutationFn: () =>
      apiPut("/settings/cloudinary", {
        enabled: cloudinaryEnabled,
        keys: JSON.parse(cloudinaryJson || "[]"),
      }),
    onSuccess: () => toast.success("Đã lưu cấu hình Cloudinary."),
    onError: (error: Error) => toast.error(error.message),
  });
  const saveAffiliate = useMutation({
    mutationFn: () => apiPut("/settings/affiliate", affiliate),
    onSuccess: () => toast.success("Đã lưu cấu hình Affiliate."),
    onError: (error: Error) => toast.error(error.message),
  });
  const testAi = useMutation({
    mutationFn: () =>
      apiPost<{ output: string }>("/settings/ai/test", {
        ...ai,
        text: testText,
      }),
    onSuccess: (data) => {
      setTestOutput(data.output);
      toast.success("Đã chạy test prompt.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleThemeChange = (value: string) => {
    const nextTheme = value as ThemePreference;
    setThemePreferenceState(nextTheme);
    setThemePreference(nextTheme);
    toast.success(
      nextTheme === "system"
        ? "Đã chuyển sang chế độ theo máy tính."
        : `Đã chuyển giao diện sang chế độ ${nextTheme === "dark" ? "tối" : "sáng"}.`,
    );
  };

  return (
    <>
      <PageHeader
        title="Cài đặt"
        subtitle="Cấu hình hệ thống theo từng mục. Chọn nhóm ở menu trái, chỉnh input ở khung bên phải."
      />

      <div className="settings-layout">
        <aside className="settings-menu">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "active" : ""}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              <span>
                <strong>{tab.label}</strong>
                <small>{tab.description}</small>
              </span>
            </button>
          ))}
        </aside>

        <SectionCard>
          {activeTab === "appearance" ? (
            <div className="form-grid">
              <label>
                <Label>Theme giao diện</Label>
                <Select
                  value={themePreference}
                  onChange={(event) => handleThemeChange(event.target.value)}
                >
                  <option value="system">Theo máy tính</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </Select>
              </label>
              <div className="field">
                <Label>Trạng thái hiện tại</Label>
                <div className="simple-row">
                  <div className="simple-row-main">
                    <div className="simple-row-title">
                      {themePreference === "system" ? (
                        <Monitor aria-hidden size={16} />
                      ) : themePreference === "dark" ? (
                        <MoonStar aria-hidden size={16} />
                      ) : (
                        <Sun aria-hidden size={16} />
                      )}
                      <span>
                        {themePreference === "system"
                          ? "Đang theo máy tính"
                          : themePreference === "dark"
                            ? "Đang dùng dark mode"
                            : "Đang dùng light mode"}
                      </span>
                    </div>
                    <small>
                      {themePreference === "system"
                        ? `Máy tính hiện đang ở chế độ ${systemTheme === "dark" ? "tối" : "sáng"}.`
                        : "Lựa chọn này được lưu trên trình duyệt hiện tại và áp dụng ngay lập tức."}
                    </small>
                  </div>
                </div>
              </div>
              <div className="span-2 field-help">
                Mặc định hệ thống lấy theo cài đặt giao diện của máy tính. Bạn
                có thể đổi sang light hoặc dark bất kỳ lúc nào trong mục này.
              </div>
            </div>
          ) : null}

          {activeTab === "runtime" ? (
            <div className="form-grid">
              <label>
                <Label>Cổng web</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={runtime.server.port}
                  onChange={(event) =>
                    setRuntime((current) => ({
                      ...current,
                      server: {
                        ...current.server,
                        port: Number(event.target.value),
                      },
                    }))
                  }
                />
              </label>
              <label>
                <Label>Chế độ truy cập</Label>
                <Select
                  value={runtime.server.exposeLan ? "lan" : "local"}
                  onChange={(event) => {
                    const exposeLan = event.target.value === "lan";
                    setRuntime((current) => ({
                      ...current,
                      server: {
                        ...current.server,
                        exposeLan,
                        host: exposeLan ? "0.0.0.0" : "127.0.0.1",
                      },
                    }));
                  }}
                >
                  <option value="local">Chỉ máy này</option>
                  <option value="lan">Cho phép máy khác trong LAN</option>
                </Select>
              </label>
              <label className="span-2">
                <Label>Thư mục dữ liệu AppData</Label>
                <Input readOnly value={runtime.appDataDir} />
              </label>
              <label className="span-2">
                <Label>SQLite DB</Label>
                <Input readOnly value={runtime.dbPath} />
              </label>
              <label className="span-2">
                <Label>File config.toml</Label>
                <Input readOnly value={runtime.configPath} />
              </label>
              <label>
                <Label>Bật tunnel</Label>
                <Select
                  value={runtime.tunnel.enabled ? "true" : "false"}
                  onChange={(event) =>
                    setRuntime((current) => ({
                      ...current,
                      tunnel: {
                        ...current.tunnel,
                        enabled: event.target.value === "true",
                      },
                    }))
                  }
                >
                  <option value="false">Đang tắt</option>
                  <option value="true">Đang bật</option>
                </Select>
              </label>
              <label>
                <Label>Provider tunnel</Label>
                <Select
                  value={runtime.tunnel.provider}
                  onChange={(event) =>
                    setRuntime((current) => ({
                      ...current,
                      tunnel: {
                        ...current.tunnel,
                        provider: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="cloudflare">Cloudflare Tunnel</option>
                  <option value="tailscale">Tailscale Funnel</option>
                  <option value="manual">Tự cấu hình</option>
                </Select>
              </label>
              <label className="span-2">
                <Label>Token tunnel</Label>
                <Input
                  type="password"
                  value={runtime.tunnel.token}
                  onChange={(event) =>
                    setRuntime((current) => ({
                      ...current,
                      tunnel: { ...current.tunnel, token: event.target.value },
                    }))
                  }
                />
              </label>
              <label className="span-2">
                <Label>URL public</Label>
                <Input
                  value={runtime.tunnel.publicUrl}
                  onChange={(event) =>
                    setRuntime((current) => ({
                      ...current,
                      tunnel: {
                        ...current.tunnel,
                        publicUrl: event.target.value,
                      },
                    }))
                  }
                  placeholder="https://zerun.example.com"
                />
              </label>
              <div className="span-2 actions">
                <Button
                  icon={<Save aria-hidden />}
                  onClick={() => saveRuntime.mutate()}
                >
                  Lưu Desktop host
                </Button>
              </div>
            </div>
          ) : null}

          {activeTab === "ai" ? (
            <div className="form-grid">
              <label>
                <Label>Provider</Label>
                <Input
                  value={ai.provider}
                  onChange={(event) =>
                    setAi((current) => ({
                      ...current,
                      provider: event.target.value,
                    }))
                  }
                  placeholder="openai / anthropic / local"
                />
              </label>
              <label>
                <Label>Model</Label>
                <Input
                  value={ai.model}
                  onChange={(event) =>
                    setAi((current) => ({
                      ...current,
                      model: event.target.value,
                    }))
                  }
                  placeholder="gpt-5.4"
                />
              </label>
              <label className="span-2">
                <Label>API key</Label>
                <Input
                  type="password"
                  value={ai.apiKey}
                  onChange={(event) =>
                    setAi((current) => ({
                      ...current,
                      apiKey: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="span-2">
                <Label>Prompt rewrite mặc định</Label>
                <Textarea
                  value={ai.rewritePrompt}
                  onChange={(event) =>
                    setAi((current) => ({
                      ...current,
                      rewritePrompt: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="span-2">
                <Label>Prompt xóa link không hợp lệ</Label>
                <Textarea
                  value={ai.removeInvalidLinkPrompt}
                  onChange={(event) =>
                    setAi((current) => ({
                      ...current,
                      removeInvalidLinkPrompt: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="span-2">
                <Label>Test prompt</Label>
                <Textarea
                  value={testText}
                  onChange={(event) => setTestText(event.target.value)}
                />
              </label>
              <div className="span-2 actions">
                <Button
                  icon={<Save aria-hidden />}
                  onClick={() => saveAi.mutate()}
                >
                  Lưu AI
                </Button>
                <Button variant="secondary" onClick={() => testAi.mutate()}>
                  Test prompt
                </Button>
              </div>
              {testOutput ? (
                <Textarea className="span-2" readOnly value={testOutput} />
              ) : null}
            </div>
          ) : null}

          {activeTab === "cloudinary" ? (
            <div className="form-grid">
              <label>
                <Label>Trạng thái</Label>
                <Select
                  value={cloudinaryEnabled ? "true" : "false"}
                  onChange={(event) =>
                    setCloudinaryEnabled(event.target.value === "true")
                  }
                >
                  <option value="true">Đang bật</option>
                  <option value="false">Đang tắt</option>
                </Select>
              </label>
              <label className="span-2">
                <Label>Danh sách key JSON</Label>
                <Textarea
                  value={cloudinaryJson}
                  onChange={(event) => setCloudinaryJson(event.target.value)}
                />
              </label>
              <div className="span-2 actions">
                <Button
                  icon={<Save aria-hidden />}
                  onClick={() => saveCloudinary.mutate()}
                >
                  Lưu Cloudinary
                </Button>
              </div>
            </div>
          ) : null}

          {activeTab === "affiliate" ? (
            <div className="form-grid">
              <label>
                <Label>Network hỗ trợ</Label>
                <Input
                  value={affiliate.networks.join(", ")}
                  onChange={(event) =>
                    setAffiliate((current) => ({
                      ...current,
                      networks: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </label>
              <label>
                <Label>Link chưa hỗ trợ</Label>
                <Select
                  value={affiliate.unknownLinkAction}
                  onChange={(event) =>
                    setAffiliate((current) => ({
                      ...current,
                      unknownLinkAction: event.target.value,
                    }))
                  }
                >
                  <option value="saved_for_review">Đưa vào Kho lưu trữ</option>
                  <option value="remove">Xóa đoạn chứa link</option>
                  <option value="keep">Giữ nguyên</option>
                </Select>
              </label>
              <div className="span-2 actions">
                <Button
                  icon={<Save aria-hidden />}
                  onClick={() => saveAffiliate.mutate()}
                >
                  Lưu Affiliate
                </Button>
              </div>
            </div>
          ) : null}

          {activeTab === "telegram" ? (
            <div className="form-grid">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={telegram.enabled}
                  onChange={(event) =>
                    setTelegram((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                />
                <span>Bật nhận thông báo Telegram</span>
              </label>
              <label>
                <Label>Bot Token</Label>
                <Input
                  value={telegram.botToken}
                  onChange={(event) =>
                    setTelegram((current) => ({
                      ...current,
                      botToken: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <Label>Chat ID</Label>
                <Input
                  value={telegram.chatId}
                  onChange={(event) =>
                    setTelegram((current) => ({
                      ...current,
                      chatId: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="span-2 actions">
                <Button
                  icon={<Save aria-hidden />}
                  onClick={() => saveTelegram.mutate()}
                >
                  Lưu Telegram
                </Button>
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}
