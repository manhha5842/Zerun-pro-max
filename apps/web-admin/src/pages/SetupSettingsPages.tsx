import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, Save, TestTube2, Eye, EyeOff, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { SetupGuide } from "../components/common/SetupGuide";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import {
  fromOldPayload,
  toOldPayload,
  validatePlatformConfig,
  testPlatformConversion,
  buildShopeeSubId,
  mapLazadaSubIdsBySource,
  mapTikTokTrackingPayload,
  normalizeShopeeAffiliateUrl,
  type NewAffiliateConfig,
  type ShopeeConfig,
  type LazadaConfig,
  type TikTokShopConfig
} from "../services/affiliateService";

type AiSettings = {
  provider: string;
  apiKey: string;
  model: string;
  rewritePrompt: string;
  removeInvalidLinkPrompt: string;
};

type AffiliateSettings = {
  networks: string[];
  unknownLinkAction: string;
  accessTradeToken?: string;
  accessTradeCampaignId?: string;
  shopeeMode?: string;
  shopeeAffiliateId?: string;
  lazadaKey?: string;
  lazadaSecret?: string;
  lazadaToken?: string;
  lazadaRegion?: string;
  shopee?: PlatformAffiliateSettings;
  lazada?: PlatformAffiliateSettings;
  tiktok?: PlatformAffiliateSettings;
};

type AffiliateProvider = "web" | "api" | "accesstrade" | "affiliate_id";

type AffiliatePlatform = "shopee" | "lazada" | "tiktok";

type PlatformAffiliateSettings = {
  enabled: boolean;
  primary: AffiliateProvider;
  fallbackEnabled: boolean;
  fallback: AffiliateProvider;
  affiliateId?: string;
  campaignId?: string;
  subId?: string;
};

type LinkConvertResult = {
  original: string;
  converted: string | null;
  network: string;
  success: boolean;
  error?: string;
};

type TelegramSettings = {
  enabled: boolean;
  botToken: string;
  chatId: string;
};

const providerLabels: Record<AffiliateProvider, string> = {
  web: "Web/session",
  api: "API chính thức",
  accesstrade: "AccessTrade",
  affiliate_id: "Thay affiliate_id"
};

const platformOptions: Record<AffiliatePlatform, AffiliateProvider[]> = {
  shopee: ["web", "accesstrade", "affiliate_id"],
  lazada: ["api", "web", "accesstrade"],
  tiktok: ["accesstrade"]
};

const defaultPlatformAffiliate: Record<AffiliatePlatform, PlatformAffiliateSettings> = {
  shopee: {
    enabled: true,
    primary: "web",
    fallbackEnabled: true,
    fallback: "accesstrade",
    affiliateId: "",
    campaignId: "",
    subId: ""
  },
  lazada: {
    enabled: true,
    primary: "api",
    fallbackEnabled: true,
    fallback: "accesstrade",
    campaignId: "",
    subId: ""
  },
  tiktok: {
    enabled: false,
    primary: "accesstrade",
    fallbackEnabled: false,
    fallback: "accesstrade",
    campaignId: "",
    subId: ""
  }
};

const defaultAffiliateSettings: AffiliateSettings = {
  networks: ["shopee", "lazada"],
  unknownLinkAction: "saved_for_review",
  accessTradeToken: "",
  accessTradeCampaignId: "",
  shopeeMode: "auto",
  shopeeAffiliateId: "",
  lazadaKey: "",
  lazadaSecret: "",
  lazadaToken: "",
  lazadaRegion: "VN",
  shopee: defaultPlatformAffiliate.shopee,
  lazada: defaultPlatformAffiliate.lazada,
  tiktok: defaultPlatformAffiliate.tiktok
};

function normalizeAffiliateSettings(value?: AffiliateSettings): AffiliateSettings {
  const merged = { ...defaultAffiliateSettings, ...(value ?? {}) };
  const legacyShopeeMode = merged.shopeeMode === "web" || merged.shopeeMode === "auto" ? "web" : "accesstrade";

  return {
    ...merged,
    shopee: {
      ...defaultPlatformAffiliate.shopee,
      ...(value?.shopee ?? {}),
      primary: value?.shopee?.primary ?? legacyShopeeMode,
      fallbackEnabled: value?.shopee?.fallbackEnabled ?? merged.shopeeMode === "auto",
      affiliateId: value?.shopee?.affiliateId ?? merged.shopeeAffiliateId ?? ""
    },
    lazada: {
      ...defaultPlatformAffiliate.lazada,
      ...(value?.lazada ?? {})
    },
    tiktok: {
      ...defaultPlatformAffiliate.tiktok,
      ...(value?.tiktok ?? {})
    }
  };
}

function toAffiliatePayload(form: AffiliateSettings): AffiliateSettings {
  const shopee = form.shopee ?? defaultPlatformAffiliate.shopee;
  const lazada = form.lazada ?? defaultPlatformAffiliate.lazada;
  const tiktok = form.tiktok ?? defaultPlatformAffiliate.tiktok;
  const networks = [
    shopee.enabled ? "shopee" : "",
    lazada.enabled ? "lazada" : "",
    tiktok.enabled ? "tiktok_shop" : ""
  ].filter(Boolean);

  return {
    ...form,
    networks,
    shopee,
    lazada,
    tiktok,
    shopeeAffiliateId: shopee.affiliateId ?? "",
    shopeeMode: shopee.primary === "web"
      ? shopee.fallbackEnabled ? "auto" : "web"
      : shopee.primary === "accesstrade" ? "accesstrade" : "affiliate_id"
  };
}

export function AiSettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<AiSettings>({
    provider: "",
    apiKey: "",
    model: "",
    rewritePrompt: "",
    removeInvalidLinkPrompt: ""
  });
  const [testResult, setTestResult] = useState<string>("");
  const query = useQuery({ queryKey: ["settings", "ai"], queryFn: () => apiGet<AiSettings>("/settings/ai") });

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiPut("/settings/ai", form),
    onSuccess: () => toast.success("Đã lưu cấu hình AI."),
    onError: (error) => toast.error(error.message)
  });

  const test = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; model: string; latencyMs: number }>("/settings/ai/test-connection", {
      baseUrl: form.provider,
      apiKey: form.apiKey,
      model: form.model || "auto"
    }),
    onSuccess: (data) => {
      setTestResult(`Kết nối OK: ${data.model} (${data.latencyMs}ms)`);
      toast.success("Kết nối AI thành công.");
    },
    onError: (error) => {
      setTestResult(error.message);
      toast.error(error.message);
    }
  });

  return (
    <div className="page-stack">
      <PageHeader title="Cài đặt AI" subtitle="AI dùng để phân loại ngành hàng, rewrite caption và quyết định routing an toàn." />
      <SectionCard title="Hướng dẫn lấy thông số">
        <SetupGuide
          steps={[
            {
              title: "Mở dashboard của nhà cung cấp AI",
              status: "manual",
              description: "Dùng 9Router hoặc một dịch vụ có API tương thích OpenAI. Tạo API key trong mục API Keys/Credentials của chính nhà cung cấp.",
              verification: "Bạn có Base URL bắt đầu bằng https:// và một API key còn hiệu lực."
            },
            {
              title: "Nhập đúng Base URL",
              status: "ready",
              description: "Nhập URL gốc mà provider hướng dẫn cho OpenAI-compatible API. Không nhập URL của trang dashboard và không thêm /chat/completions nếu provider chỉ cung cấp base URL.",
              verification: "Base URL không phải trang đăng nhập và API key không có khoảng trắng đầu/cuối."
            },
            {
              title: "Test rồi mới lưu",
              status: "ready",
              description: "Bấm Test kết nối. Sau khi thấy Kết nối OK, cấu hình AI trong Settings sẽ được lưu và worker dùng ngay cho mọi flow bật AI.",
              verification: "Kết quả hiển thị tên model và latency; worker không còn báo AI tắt."
            }
          ]}
        />
      </SectionCard>
      <SectionCard title="Thông số AI">
        <div className="form-grid">
          <label className="span-2">
            <Label>Base URL</Label>
            <Input value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} placeholder="https://api.9router.ai" />
          </label>
          <label>
            <Label>Model</Label>
            <Input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="auto hoặc tên model" />
          </label>
          <label>
            <Label>API key</Label>
            <Input type="password" value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} />
          </label>
          <label className="span-2">
            <Label>Prompt rewrite mặc định</Label>
            <Textarea value={form.rewritePrompt} onChange={(event) => setForm((current) => ({ ...current, rewritePrompt: event.target.value }))} />
          </label>
          <label className="span-2">
            <Label>Prompt xử lý link không hợp lệ</Label>
            <Textarea value={form.removeInvalidLinkPrompt} onChange={(event) => setForm((current) => ({ ...current, removeInvalidLinkPrompt: event.target.value }))} />
          </label>
          <div className="span-2 actions">
            <Button icon={<Save aria-hidden />} onClick={() => save.mutate()} disabled={save.isPending}>Lưu AI</Button>
            <Button variant="secondary" icon={<TestTube2 aria-hidden />} onClick={() => test.mutate()} disabled={test.isPending}>Test kết nối</Button>
            {testResult ? <Badge tone={testResult.startsWith("Kết nối OK") ? "good" : "danger"}>{testResult}</Badge> : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

type BadgeStatus = "enabled" | "disabled" | "missing" | "success" | "failed";

function PlatformStatusBadge({ status }: { status: BadgeStatus }) {
  if (status === "disabled") {
    return <Badge tone="neutral">Đang tắt</Badge>;
  }
  if (status === "missing") {
    return <Badge tone="warn">Thiếu cấu hình</Badge>;
  }
  if (status === "success") {
    return <Badge tone="good">Test thành công</Badge>;
  }
  if (status === "failed") {
    return <Badge tone="danger">Test thất bại</Badge>;
  }
  return <Badge tone="good">Đang bật</Badge>;
}

function SecretInput({ value, onChange, label, disabled, placeholder }: {
  value: string;
  onChange: (val: string) => void;
  label: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <Label>{label}</Label>
      <div className="relative flex items-center w-full">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="pr-10 w-full"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          disabled={disabled}
          className="absolute right-3 p-1 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none disabled:opacity-50"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

function SubIdFields({ subIds, onChange, maxFields, warning, disabled }: {
  subIds: Record<string, string>;
  onChange: (field: string, val: string) => void;
  maxFields: number;
  warning?: string;
  disabled?: boolean;
}) {
  const keys = Array.from({ length: maxFields }, (_, i) => `subId${i + 1}`);

  return (
    <div className="flex flex-col gap-2 w-full">
      <Label>Tracking/Sub IDs</Label>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {keys.map((k, idx) => (
          <div key={k} className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-400 font-semibold dark:text-gray-500 uppercase tracking-wider">Sub {idx + 1}</span>
            <Input
              value={subIds[k] || ""}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
                onChange(k, sanitized);
              }}
              disabled={disabled}
              placeholder={`Sub ${idx + 1}`}
              className="text-xs h-9"
            />
          </div>
        ))}
      </div>
      {warning && (
        <span className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1 font-medium mt-1">
          <AlertTriangle size={14} className="shrink-0" /> {warning}
        </span>
      )}
    </div>
  );
}

function ShopeeCard({
  config,
  status,
  errors,
  testResult,
  loading,
  isSaving,
  onChange,
  onSave,
  onTest
}: {
  config: ShopeeConfig;
  status: BadgeStatus;
  errors: string[];
  testResult: any;
  loading: boolean;
  isSaving: boolean;
  onChange: (patch: Partial<ShopeeConfig>) => void;
  onSave: () => void;
  onTest: () => void;
}) {
  const disabled = !config.enabled;

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-1.5 bg-gradient-to-r from-orange-500 to-amber-500 w-full" />
      
      <div className="p-5 flex flex-col gap-5 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Shopee</h2>
            <PlatformStatusBadge status={status} />
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none dark:bg-gray-700 peer-focus:ring-2 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
          </label>
        </div>

        <div className={`flex flex-col gap-5 transition-opacity duration-200 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Nguồn chuyển đổi</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nguồn chính</Label>
                <Select
                  value={config.primarySource}
                  onChange={(e) => onChange({ primarySource: e.target.value as any })}
                  disabled={disabled}
                >
                  <option value="accesstrade">AccessTrade</option>
                  <option value="web">Web UI (Extension)</option>
                </Select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="checkbox-row pb-2">
                  <input
                    type="checkbox"
                    checked={config.useFallback}
                    onChange={(e) => onChange({ useFallback: e.target.checked })}
                    disabled={disabled}
                  />
                  <span className="text-xs">Dùng fallback</span>
                </label>
              </div>
            </div>
            {config.useFallback && (
              <div className="w-1/2">
                <Label>Nguồn fallback</Label>
                <Select
                  value={config.fallbackSource}
                  onChange={(e) => onChange({ fallbackSource: e.target.value as any })}
                  disabled={disabled}
                >
                  <option value="accesstrade">AccessTrade</option>
                  <option value="web">Web UI (Extension)</option>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Credentials</h3>
            <SecretInput
              label="AccessTrade Token"
              value={config.accessTradeToken}
              onChange={(val) => onChange({ accessTradeToken: val })}
              disabled={disabled}
              placeholder="Nhập token AccessTrade riêng cho Shopee"
            />
            <div className="w-full">
              <Label>Campaign ID</Label>
              <Input
                value={config.campaignId}
                onChange={(e) => onChange({ campaignId: e.target.value })}
                disabled={disabled}
                placeholder="Campaign ID Shopee"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Tracking/Sub ID</h3>
            <SubIdFields
              subIds={config.subIds}
              onChange={(k, val) => onChange({ subIds: { ...config.subIds, [k]: val } })}
              maxFields={5}
              disabled={disabled}
            />
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Thông tin Affiliate</h3>
            <div>
              <Label>Shopee Affiliate ID</Label>
              <Input
                value={config.affiliateId}
                onChange={(e) => onChange({ affiliateId: e.target.value })}
                disabled={disabled}
                placeholder="Nhập affiliate_id để convert và làm fallback thủ công"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">URL test</h3>
            <div className="flex flex-col gap-2">
              <Input
                value={config.testUrl}
                onChange={(e) => onChange({ testUrl: e.target.value })}
                disabled={disabled}
                placeholder="Dán link Shopee để test"
                className="text-xs"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<TestTube2 size={14} />}
                  onClick={onTest}
                  disabled={disabled || loading || !config.testUrl.trim()}
                >
                  {loading ? "Đang test..." : "Test chuyển đổi"}
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving}
                >
                  Lưu cấu hình
                </Button>
              </div>
            </div>
            
            {errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950 p-2.5 rounded-lg border border-red-200 dark:border-red-900 mt-2">
                <span className="text-xs font-semibold text-red-700 dark:text-red-400 block mb-1">Cảnh báo cấu hình:</span>
                <ul className="list-disc pl-4 text-[11px] text-red-600 dark:text-red-300 space-y-0.5">
                  {errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {testResult && (
              <div className={`p-2.5 rounded-lg border text-xs mt-2 ${testResult.success ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900 text-green-800 dark:text-green-300" : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900 text-red-800 dark:text-red-300"}`}>
                <span className="font-semibold block mb-0.5">{testResult.success ? "Test thành công" : "Test thất bại"}</span>
                {testResult.success ? (
                  <span className="break-all font-mono text-[10px] select-all">{testResult.converted}</span>
                ) : (
                  <span>{testResult.error || "Không chuyển đổi được link."}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LazadaCard({
  config,
  status,
  errors,
  testResult,
  loading,
  isSaving,
  onChange,
  onSave,
  onTest
}: {
  config: LazadaConfig;
  status: BadgeStatus;
  errors: string[];
  testResult: any;
  loading: boolean;
  isSaving: boolean;
  onChange: (patch: Partial<LazadaConfig>) => void;
  onSave: () => void;
  onTest: () => void;
}) {
  const disabled = !config.enabled;
  const defaultSet = config.subIdSets?.find((s) => s.isDefault) || config.subIdSets?.[0] || {
    id: "default",
    name: "Mặc định",
    subId1: "",
    subId2: "",
    subId3: "",
    subId4: "",
    subId5: "",
    subId6: "",
    isDefault: true,
    subIdKey: ""
  };
  const { warning: subIdWarning } = mapLazadaSubIdsBySource(defaultSet, config.primarySource);

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 w-full" />

      <div className="p-5 flex flex-col gap-5 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Lazada</h2>
            <PlatformStatusBadge status={status} />
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none dark:bg-gray-700 peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className={`flex flex-col gap-5 transition-opacity duration-200 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Nguồn chuyển đổi</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nguồn chính</Label>
                 <Select
                  value={config.primarySource === "lazada_api" ? "web" : config.primarySource}
                  onChange={(e) => onChange({ primarySource: e.target.value as any })}
                  disabled={disabled}
                >
                  <option value="accesstrade">AccessTrade</option>
                  <option value="web">Web UI (Extension)</option>
                </Select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="checkbox-row pb-2">
                  <input
                    type="checkbox"
                    checked={config.useFallback}
                    onChange={(e) => onChange({ useFallback: e.target.checked })}
                    disabled={disabled}
                  />
                  <span className="text-xs">Dùng fallback</span>
                </label>
              </div>
            </div>
            {config.useFallback && (
              <div className="w-1/2">
                <Label>Nguồn fallback</Label>
                <Select
                  value={config.fallbackSource === "lazada_api" ? "web" : config.fallbackSource}
                  onChange={(e) => onChange({ fallbackSource: e.target.value as any })}
                  disabled={disabled}
                >
                  <option value="accesstrade">AccessTrade</option>
                  <option value="web">Web UI (Extension)</option>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Credentials</h3>
            
            {(config.primarySource === "accesstrade" || config.fallbackSource === "accesstrade") && (
              <>
                <SecretInput
                  label="AccessTrade Token (Lazada)"
                  value={config.accessTradeToken}
                  onChange={(val) => onChange({ accessTradeToken: val })}
                  disabled={disabled}
                  placeholder="Token AccessTrade riêng cho Lazada"
                />
                <div>
                  <Label>Campaign ID riêng</Label>
                  <Input
                    value={config.campaignId}
                    onChange={(e) => onChange({ campaignId: e.target.value })}
                    disabled={disabled}
                    placeholder="Campaign ID Lazada"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Tracking/Sub ID</h3>
            <SubIdFields
              subIds={{
                subId1: defaultSet.subId1,
                subId2: defaultSet.subId2,
                subId3: defaultSet.subId3,
                subId4: defaultSet.subId4,
                subId5: defaultSet.subId5,
                subId6: defaultSet.subId6,
              }}
              onChange={(k, val) => {
                const nextSets = (config.subIdSets || []).map((s) => {
                  if (s.id === defaultSet.id) {
                    return { ...s, [k]: val };
                  }
                  return s;
                });
                if (!config.subIdSets || config.subIdSets.length === 0) {
                  nextSets.push({ ...defaultSet, [k]: val });
                }
                onChange({ subIdSets: nextSets });
              }}
              maxFields={6}
              warning={subIdWarning}
              disabled={disabled}
            />
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">URL test</h3>
            <div className="flex flex-col gap-2">
              <Input
                value={config.testUrl}
                onChange={(e) => onChange({ testUrl: e.target.value })}
                disabled={disabled}
                placeholder="Dán link Lazada để test"
                className="text-xs"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<TestTube2 size={14} />}
                  onClick={onTest}
                  disabled={disabled || loading || !config.testUrl.trim()}
                >
                  {loading ? "Đang test..." : "Test chuyển đổi"}
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving}
                >
                  Lưu cấu hình
                </Button>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950 p-2.5 rounded-lg border border-red-200 dark:border-red-900 mt-2">
                <span className="text-xs font-semibold text-red-700 dark:text-red-400 block mb-1">Cảnh báo cấu hình:</span>
                <ul className="list-disc pl-4 text-[11px] text-red-600 dark:text-red-300 space-y-0.5">
                  {errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {testResult && (
              <div className={`p-2.5 rounded-lg border text-xs mt-2 ${testResult.success ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900 text-green-800 dark:text-green-300" : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900 text-red-800 dark:text-red-300"}`}>
                <span className="font-semibold block mb-0.5">{testResult.success ? "Test thành công" : "Test thất bại"}</span>
                {testResult.success ? (
                  <span className="break-all font-mono text-[10px] select-all">{testResult.converted}</span>
                ) : (
                  <span>{testResult.error || "Không chuyển đổi được link."}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TikTokShopCard({
  config,
  status,
  errors,
  testResult,
  loading,
  isSaving,
  onChange,
  onSave,
  onTest
}: {
  config: TikTokShopConfig;
  status: BadgeStatus;
  errors: string[];
  testResult: any;
  loading: boolean;
  isSaving: boolean;
  onChange: (patch: Partial<TikTokShopConfig>) => void;
  onSave: () => void;
  onTest: () => void;
}) {
  const disabled = !config.enabled;
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-1.5 bg-gradient-to-r from-red-600 via-gray-900 to-teal-400 w-full" />

      <div className="p-5 flex flex-col gap-5 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">TikTok Shop</h2>
            <PlatformStatusBadge status={status} />
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none dark:bg-gray-700 peer-focus:ring-2 peer-focus:ring-teal-300 dark:peer-focus:ring-teal-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
          </label>
        </div>

        <div className={`flex flex-col gap-5 transition-opacity duration-200 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Nguồn chuyển đổi</h3>
            <div>
              <Label>Nguồn chính</Label>
              <Select value="accesstrade" disabled={true}>
                <option value="accesstrade">AccessTrade</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">Credentials</h3>
            <SecretInput
              label="AccessTrade Token"
              value={config.accessTradeToken}
              onChange={(val) => onChange({ accessTradeToken: val })}
              disabled={disabled}
              placeholder="Token AccessTrade riêng cho TikTok Shop"
            />
            <div>
              <Label>Campaign ID riêng (Optional)</Label>
              <Input
                value={config.campaignId}
                onChange={(e) => onChange({ campaignId: e.target.value })}
                disabled={disabled}
                placeholder="Campaign ID TikTok Shop"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full p-2 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold text-gray-700 dark:text-gray-300"
            >
              <span>Tracking nâng cao</span>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {showAdvanced && (
              <div className="p-3 border rounded-lg flex flex-col gap-3 bg-gray-50/50 dark:bg-gray-900/50 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label className="text-[10px]">utm_source</Label>
                    <Input
                      value={config.tracking.utmSource}
                      onChange={(e) => onChange({ tracking: { ...config.tracking, utmSource: e.target.value } })}
                      disabled={disabled}
                      placeholder="e.g. facebook"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">utm_medium</Label>
                    <Input
                      value={config.tracking.utmMedium}
                      onChange={(e) => onChange({ tracking: { ...config.tracking, utmMedium: e.target.value } })}
                      disabled={disabled}
                      placeholder="e.g. social"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">utm_campaign</Label>
                    <Input
                      value={config.tracking.utmCampaign}
                      onChange={(e) => onChange({ tracking: { ...config.tracking, utmCampaign: e.target.value } })}
                      disabled={disabled}
                      placeholder="e.g. tet-sale"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">utm_content</Label>
                    <Input
                      value={config.tracking.utmContent}
                      onChange={(e) => onChange({ tracking: { ...config.tracking, utmContent: e.target.value } })}
                      disabled={disabled}
                      placeholder="e.g. bio-link"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t pt-2.5">
                  <div>
                    <Label className="text-[9px]">sub_1</Label>
                    <Input
                      value={config.tracking.sub1}
                      onChange={(e) => onChange({ tracking: { ...config.tracking, sub1: e.target.value } })}
                      disabled={disabled}
                      placeholder="sub1"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[9px]">sub_2</Label>
                    <Input
                      value={config.tracking.sub2}
                      onChange={(e) => onChange({ tracking: { ...config.tracking, sub2: e.target.value } })}
                      disabled={disabled}
                      placeholder="sub2"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[9px]">sub_3</Label>
                    <Input
                      value={config.tracking.sub3}
                      onChange={(e) => onChange({ tracking: { ...config.tracking, sub3: e.target.value } })}
                      disabled={disabled}
                      placeholder="sub3"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[9px]">sub_4</Label>
                    <Input
                      value={config.tracking.sub4}
                      onChange={(e) => onChange({ tracking: { ...config.tracking, sub4: e.target.value } })}
                      disabled={disabled}
                      placeholder="sub4"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold border-b pb-1 text-gray-700 dark:text-gray-300">URL test</h3>
            <div className="flex flex-col gap-2">
              <Input
                value={config.testUrl}
                onChange={(e) => onChange({ testUrl: e.target.value })}
                disabled={disabled}
                placeholder="Dán link TikTok Shop để test"
                className="text-xs"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<TestTube2 size={14} />}
                  onClick={onTest}
                  disabled={disabled || loading || !config.testUrl.trim()}
                >
                  {loading ? "Đang test..." : "Test chuyển đổi"}
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving}
                >
                  Lưu cấu hình
                </Button>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950 p-2.5 rounded-lg border border-red-200 dark:border-red-900 mt-2">
                <span className="text-xs font-semibold text-red-700 dark:text-red-400 block mb-1">Cảnh báo cấu hình:</span>
                <ul className="list-disc pl-4 text-[11px] text-red-600 dark:text-red-300 space-y-0.5">
                  {errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {testResult && (
              <div className={`p-2.5 rounded-lg border text-xs mt-2 ${testResult.success ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900 text-green-800 dark:text-green-300" : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900 text-red-800 dark:text-red-300"}`}>
                <span className="font-semibold block mb-0.5">{testResult.success ? "Test thành công" : "Test thất bại"}</span>
                {testResult.success ? (
                  <span className="break-all font-mono text-[10px] select-all">{testResult.converted}</span>
                ) : (
                  <span>{testResult.error || "Không chuyển đổi được link."}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AffiliateSettingsPage() {
  const toast = useToast();
  const query = useQuery({
    queryKey: ["settings", "affiliate"],
    queryFn: () => apiGet<any>("/settings/affiliate")
  });

  const [config, setConfig] = useState<NewAffiliateConfig | null>(null);

  useEffect(() => {
    if (query.data) {
      setConfig(fromOldPayload(query.data));
    }
  }, [query.data]);

  const savePlatform = useMutation({
    mutationFn: (newConfig: NewAffiliateConfig) => apiPut("/settings/affiliate", toOldPayload(newConfig, query.data)),
    onSuccess: () => {
      toast.success("Đã lưu cấu hình affiliate thành công.");
      query.refetch();
    },
    onError: (error) => toast.error(error.message)
  });

  const [testLoading, setTestLoading] = useState<Record<string, boolean>>({
    shopee: false,
    lazada: false,
    tiktok: false
  });
  
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; converted: string | null; error?: string } | null>>({
    shopee: null,
    lazada: null,
    tiktok: null
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({
    shopee: [],
    lazada: [],
    tiktok: []
  });

  const handleTest = async (platform: "shopee" | "lazada" | "tiktok") => {
    if (!config) return;
    const platformConfig = platform === "tiktok" ? config.tiktokShop : config[platform];
    const testUrl = platformConfig.testUrl;

    const errors = validatePlatformConfig(platform, platformConfig, testUrl);
    setValidationErrors(prev => ({ ...prev, [platform]: errors }));
    if (errors.length > 0) {
      toast.error(`Cấu hình ${platform} không hợp lệ để test.`);
      return;
    }

    setTestLoading(prev => ({ ...prev, [platform]: true }));
    setTestResults(prev => ({ ...prev, [platform]: null }));

    try {
      const res = await testPlatformConversion(platform, platformConfig, testUrl);
      setTestResults(prev => ({ ...prev, [platform]: res }));
      if (res.success) {
        toast.success(`Test ${platform} thành công.`);
      } else {
        toast.error(`Test ${platform} thất bại: ${res.error || "Lỗi không xác định"}`);
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [platform]: { success: false, converted: null, error: err.message || "Lỗi kết nối" }
      }));
      toast.error(`Lỗi hệ thống khi test ${platform}: ${err.message}`);
    } finally {
      setTestLoading(prev => ({ ...prev, [platform]: false }));
    }
  };

  const handleSavePlatform = (platform: "shopee" | "lazada" | "tiktok") => {
    if (!config) return;
    const platformConfig = platform === "tiktok" ? config.tiktokShop : config[platform];

    const errors = validatePlatformConfig(platform, platformConfig);
    setValidationErrors(prev => ({ ...prev, [platform]: errors }));
    if (errors.length > 0) {
      toast.error(`Cấu hình ${platform} không hợp lệ, không thể lưu.`);
      return;
    }

    savePlatform.mutate(config);
  };

  if (query.isLoading || !config) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="animate-spin text-primary" size={32} />
        <span className="ml-2 font-medium">Đang tải cấu hình...</span>
      </div>
    );
  }

  const getBadgeStatus = (platform: "shopee" | "lazada" | "tiktok") => {
    const platformConfig = platform === "tiktok" ? config.tiktokShop : config[platform];
    if (!platformConfig.enabled) return "disabled";
    
    const errors = validatePlatformConfig(platform, platformConfig);
    if (errors.length > 0) return "missing";

    const testRes = testResults[platform];
    if (testRes) {
      return testRes.success ? "success" : "failed";
    }
    return "enabled";
  };

  return (
    <div className="page-stack">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b pb-4 mb-6">
        <div>
          <PageHeader title="Cấu hình chuyển đổi link" subtitle="Thiết lập riêng cho từng nền tảng affiliate." />
        </div>
        <div className="mt-4 md:mt-0 flex gap-3 items-center">
          <Button variant="secondary" icon={<RefreshCw size={16} className={query.isFetching ? "animate-spin" : ""} />} onClick={() => query.refetch()} disabled={query.isFetching}>
            Làm mới
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <ShopeeCard
          config={config.shopee}
          status={getBadgeStatus("shopee")}
          errors={validationErrors.shopee}
          testResult={testResults.shopee}
          loading={testLoading.shopee}
          isSaving={savePlatform.isPending}
          onChange={(patch) => setConfig(prev => prev ? { ...prev, shopee: { ...prev.shopee, ...patch } } : null)}
          onSave={() => handleSavePlatform("shopee")}
          onTest={() => handleTest("shopee")}
        />

        <LazadaCard
          config={config.lazada}
          status={getBadgeStatus("lazada")}
          errors={validationErrors.lazada}
          testResult={testResults.lazada}
          loading={testLoading.lazada}
          isSaving={savePlatform.isPending}
          onChange={(patch) => setConfig(prev => prev ? { ...prev, lazada: { ...prev.lazada, ...patch } } : null)}
          onSave={() => handleSavePlatform("lazada")}
          onTest={() => handleTest("lazada")}
        />

        <TikTokShopCard
          config={config.tiktokShop}
          status={getBadgeStatus("tiktok")}
          errors={validationErrors.tiktok}
          testResult={testResults.tiktok}
          loading={testLoading.tiktok}
          isSaving={savePlatform.isPending}
          onChange={(patch) => setConfig(prev => prev ? { ...prev, tiktokShop: { ...prev.tiktokShop, ...patch } } : null)}
          onSave={() => handleSavePlatform("tiktok")}
          onTest={() => handleTest("tiktok")}
        />
      </div>

      <div className="mt-8 border-t pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
        <div className="max-w-md">
          <Label>Hành động cho link không được hỗ trợ</Label>
          <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">Quyết định cách xử lý khi bot phát hiện một link không thuộc Shopee, Lazada hay TikTok Shop.</p>
          <div className="mt-2">
            <Select
              value={config.unknownLinkAction}
              onChange={(e) => setConfig(prev => prev ? { ...prev, unknownLinkAction: e.target.value } : null)}
              className="w-full md:w-80 select-clean"
            >
              <option value="saved_for_review">Đưa vào Link lỗi cần xử lý</option>
              <option value="keep">Giữ nguyên</option>
              <option value="remove">Gỡ khỏi caption</option>
            </Select>
          </div>
        </div>
        <div className="flex gap-3 items-end">
          <Button
            icon={<Save size={16} />}
            onClick={() => {
              if (config) savePlatform.mutate(config);
            }}
            disabled={savePlatform.isPending}
          >
            Lưu tất cả cấu hình
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LegacyAffiliateSettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<AffiliateSettings>({
    networks: ["shopee", "lazada"],
    unknownLinkAction: "saved_for_review",
    accessTradeToken: "",
    accessTradeCampaignId: "",
    shopeeMode: "accesstrade",
    lazadaKey: "",
    lazadaSecret: "",
    lazadaToken: "",
    lazadaRegion: "VN"
  });
  const query = useQuery({ queryKey: ["settings", "affiliate"], queryFn: () => apiGet<AffiliateSettings>("/settings/affiliate") });

  useEffect(() => {
    if (query.data) setForm((current) => ({ ...current, ...query.data }));
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiPut("/settings/affiliate", form),
    onSuccess: () => toast.success("Đã lưu cấu hình Affiliate. Khởi động lại npm run dev để worker nạp credential mới."),
    onError: (error) => toast.error(error.message)
  });

  return (
    <div className="page-stack">
      <PageHeader title="Cài đặt Affiliate" subtitle="Credential được worker nạp khi khởi động. Sau khi lưu, cần chạy lại npm run dev." />
      <SectionCard title="Hướng dẫn lấy thông số">
        <SetupGuide
          steps={[
            {
              title: "Lấy AccessTrade API key",
              status: "manual",
              description: "Đăng nhập Publisher Dashboard AccessTrade. Mở khu vực API/Developer hoặc yêu cầu AccessTrade cấp API key cho tài khoản publisher; đây không phải mật khẩu đăng nhập.",
              href: "https://pub2.accesstrade.vn/",
              linkLabel: "Mở AccessTrade Publisher",
              verification: "Bạn có API key dùng được với AccessTrade Product Link API."
            },
            {
              title: "Lấy Campaign ID",
              status: "manual",
              description: "Mở chiến dịch Shopee/Lazada đã được duyệt trong AccessTrade và lấy campaign ID của chiến dịch. Mỗi link convert cần campaign hợp lệ.",
              verification: "Tài khoản publisher đã được duyệt chiến dịch và Campaign ID không rỗng."
            },
            {
              title: "Cấu hình Shopee qua AccessTrade",
              status: "ready",
              description: "Phase hiện tại chỉ hỗ trợ ổn định mode accesstrade. Web mode cần session affiliate Shopee và chưa được nối vào UI.",
              verification: "Shopee mode là Qua AccessTrade."
            },
            {
              title: "Lazada Open Platform",
              status: "pending",
              description: "Nếu dùng API Lazada trực tiếp, tạo app tại Lazada Open Platform để lấy App Key/App Secret và cấp Access Token. Adapter đã có nhưng vẫn cần kiểm thử bằng tài khoản thật.",
              href: "https://open.lazada.com/",
              linkLabel: "Mở Lazada Open Platform",
              verification: "App được duyệt, token chưa hết hạn và region là VN."
            },
            {
              title: "Khởi động lại và convert thử",
              status: "ready",
              description: "Lưu cấu hình, dừng tiến trình dev cũ rồi chạy lại. Mở Công cụ > Convert link nhanh và thử một URL sản phẩm thật.",
              command: "npm run dev",
              verification: "Kết quả trả về tracking link; nếu lỗi, link xuất hiện ở Link lỗi cần xử lý."
            }
          ]}
        />
      </SectionCard>
      <SectionCard title="Thông số Affiliate">
        <div className="form-grid">
          <label>
            <Label>Network hỗ trợ</Label>
            <Input
              value={form.networks.join(", ")}
              onChange={(event) => setForm((current) => ({ ...current, networks: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))}
              placeholder="shopee, lazada"
            />
          </label>
          <label>
            <Label>Link chưa hỗ trợ</Label>
            <Select value={form.unknownLinkAction} onChange={(event) => setForm((current) => ({ ...current, unknownLinkAction: event.target.value }))}>
              <option value="saved_for_review">Đưa vào Link lỗi cần xử lý</option>
              <option value="keep">Giữ nguyên</option>
              <option value="remove">Gỡ khỏi caption</option>
            </Select>
          </label>
          <label>
            <Label>AccessTrade token</Label>
            <Input type="password" value={form.accessTradeToken ?? ""} onChange={(event) => setForm((current) => ({ ...current, accessTradeToken: event.target.value }))} />
          </label>
          <label>
            <Label>AccessTrade Campaign ID</Label>
            <Input value={form.accessTradeCampaignId ?? ""} onChange={(event) => setForm((current) => ({ ...current, accessTradeCampaignId: event.target.value }))} placeholder="Campaign ID đã được duyệt" />
          </label>
          <label>
            <Label>Shopee mode</Label>
            <Select value={form.shopeeMode ?? "accesstrade"} onChange={(event) => setForm((current) => ({ ...current, shopeeMode: event.target.value }))}>
              <option value="accesstrade">Qua AccessTrade</option>
            </Select>
          </label>
          <label>
            <Label>Lazada App Key</Label>
            <Input value={form.lazadaKey ?? ""} onChange={(event) => setForm((current) => ({ ...current, lazadaKey: event.target.value }))} />
          </label>
          <label>
            <Label>Lazada App Secret</Label>
            <Input type="password" value={form.lazadaSecret ?? ""} onChange={(event) => setForm((current) => ({ ...current, lazadaSecret: event.target.value }))} />
          </label>
          <label>
            <Label>Lazada Access Token</Label>
            <Input type="password" value={form.lazadaToken ?? ""} onChange={(event) => setForm((current) => ({ ...current, lazadaToken: event.target.value }))} />
          </label>
          <label>
            <Label>Lazada Region</Label>
            <Select value={form.lazadaRegion ?? "VN"} onChange={(event) => setForm((current) => ({ ...current, lazadaRegion: event.target.value }))}>
              <option value="VN">Việt Nam (VN)</option>
              <option value="SG">Singapore (SG)</option>
              <option value="MY">Malaysia (MY)</option>
              <option value="TH">Thái Lan (TH)</option>
              <option value="PH">Philippines (PH)</option>
              <option value="ID">Indonesia (ID)</option>
            </Select>
          </label>
          <div className="span-2 actions">
            <Button icon={<Save aria-hidden />} onClick={() => save.mutate()} disabled={save.isPending}>Lưu Affiliate</Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export function TelegramAlertSettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<TelegramSettings>({ enabled: false, botToken: "", chatId: "" });
  const [testResult, setTestResult] = useState("");
  const query = useQuery({ queryKey: ["settings", "telegram"], queryFn: () => apiGet<TelegramSettings>("/settings/telegram") });

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiPut("/settings/telegram", form),
    onSuccess: () => toast.success("Đã lưu cảnh báo Telegram."),
    onError: (error) => toast.error(error.message)
  });

  const test = useMutation({
    mutationFn: () => apiPost<{ sent: boolean }>("/settings/telegram/test", form),
    onSuccess: () => {
      setTestResult("Đã gửi tin nhắn thử.");
      toast.success("Cảnh báo Telegram hoạt động.");
    },
    onError: (error) => {
      setTestResult(error.message);
      toast.error(error.message);
    }
  });

  return (
    <div className="page-stack">
      <PageHeader title="Cảnh báo Telegram" subtitle="Nhận cảnh báo khi convert lỗi, session lỗi hoặc worker cần người xử lý." />
      <SectionCard title="Hướng dẫn lấy thông số">
        <SetupGuide
          steps={[
            {
              title: "Tạo bot với BotFather",
              status: "manual",
              description: "Mở @BotFather, gửi /newbot, đặt tên và username kết thúc bằng bot. BotFather trả về token dạng 123456:ABC....",
              href: "https://t.me/BotFather",
              linkLabel: "Mở @BotFather",
              verification: "Bạn có Bot Token, không phải API Hash hay StringSession."
            },
            {
              title: "Cho bot nhận một tin nhắn",
              status: "manual",
              description: "Chat riêng: mở bot, bấm Start và gửi một tin. Group: thêm bot vào group rồi gửi một tin có nhắc tên bot để Telegram tạo update.",
              verification: "Bot đã nhận ít nhất một message sau khi được tạo/thêm vào group."
            },
            {
              title: "Lấy Chat ID bằng getUpdates",
              status: "manual",
              description: "Mở URL bên dưới sau khi thay BOT_TOKEN. Tìm result[].message.chat.id. Chat riêng thường là số dương; group/supergroup thường bắt đầu bằng dấu âm hoặc -100.",
              command: "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates",
              verification: "JSON trả về ok=true và bạn đã chép đúng message.chat.id."
            },
            {
              title: "Gửi thử rồi mới bật",
              status: "ready",
              description: "Nhập Bot Token và Chat ID, bấm Gửi thử. Khi Telegram nhận tin, bật trạng thái và lưu.",
              verification: "Chat nhận được tin “Zerun đã kết nối cảnh báo Telegram thành công.”"
            }
          ]}
        />
      </SectionCard>
      <SectionCard title="Thông số cảnh báo">
        <div className="form-grid">
          <label>
            <Label>Trạng thái</Label>
            <Select value={String(form.enabled)} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.value === "true" }))}>
              <option value="true">Đang bật</option>
              <option value="false">Đang tắt</option>
            </Select>
          </label>
          <label>
            <Label>Chat ID</Label>
            <Input value={form.chatId} onChange={(event) => setForm((current) => ({ ...current, chatId: event.target.value }))} placeholder="-100..." />
          </label>
          <label className="span-2">
            <Label>Bot token</Label>
            <Input type="password" value={form.botToken} onChange={(event) => setForm((current) => ({ ...current, botToken: event.target.value }))} />
          </label>
          <div className="span-2 actions">
            <Button icon={<Save aria-hidden />} onClick={() => save.mutate()} disabled={save.isPending}>Lưu cảnh báo</Button>
            <Button variant="secondary" icon={<TestTube2 aria-hidden />} onClick={() => test.mutate()} disabled={test.isPending}>Gửi thử</Button>
            {testResult ? <Badge tone={testResult.startsWith("Đã gửi") ? "good" : "danger"}>{testResult}</Badge> : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
