import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save } from "lucide-react";
import { apiGet, apiPut } from "../api/client";
import { LazadaAffiliateCard } from "../components/affiliate/LazadaAffiliateCard";
import { ShopeeAffiliateCard, type MethodTestState } from "../components/affiliate/ShopeeAffiliateCard";
import { TikTokAffiliateCard } from "../components/affiliate/TikTokAffiliateCard";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Button } from "../components/ui/Button";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/Toast";
import {
  fromOldPayload,
  testPlatformConversion,
  toOldPayload,
  validatePlatformConfig,
  type LazadaConfig,
  type NewAffiliateConfig,
  type ShopeeConfig
} from "../services/affiliateService";

type AffiliatePayload = Record<string, unknown>;

type AffiliateTestState = {
  shopee: Partial<Record<ShopeeConfig["primarySource"], MethodTestState>>;
  lazada: Partial<Record<LazadaConfig["primarySource"], MethodTestState>>;
  tiktok: {
    accesstrade?: MethodTestState;
  };
};

const emptyTests: AffiliateTestState = {
  shopee: {},
  lazada: {},
  tiktok: {}
};

function setMethodLoading(
  current: AffiliateTestState,
  platform: "shopee" | "lazada" | "tiktok",
  method: string,
  patch: MethodTestState
): AffiliateTestState {
  if (platform === "shopee") {
    return { ...current, shopee: { ...current.shopee, [method]: patch } };
  }
  if (platform === "lazada") {
    return { ...current, lazada: { ...current.lazada, [method]: patch } };
  }
  return { ...current, tiktok: { ...current.tiktok, accesstrade: patch } };
}

export function AffiliateSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["settings", "affiliate"],
    queryFn: () => apiGet<AffiliatePayload>("/settings/affiliate")
  });
  const [config, setConfig] = useState<NewAffiliateConfig>(() => fromOldPayload({}));
  const [tests, setTests] = useState<AffiliateTestState>(emptyTests);

  useEffect(() => {
    if (query.data) {
      setConfig(fromOldPayload(query.data));
      setTests(emptyTests);
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: (nextConfig: NewAffiliateConfig) => apiPut("/settings/affiliate", toOldPayload(nextConfig, query.data ?? {})),
    onSuccess: async () => {
      toast.success("Đã lưu cấu hình affiliate.");
      await queryClient.invalidateQueries({ queryKey: ["settings", "affiliate"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const updateConfig = (next: NewAffiliateConfig) => setConfig(next);
  const saveCurrent = () => save.mutate(config);

  const runTest = async (
    platform: "shopee" | "lazada" | "tiktok",
    method: ShopeeConfig["primarySource"] | LazadaConfig["primarySource"] | "accesstrade"
  ) => {
    const testUrl =
      platform === "shopee" ? config.shopee.testUrl :
        platform === "lazada" ? config.lazada.testUrl :
          config.tiktokShop.testUrl;

    const platformConfig =
      platform === "shopee"
        ? { ...config.shopee, primarySource: method as ShopeeConfig["primarySource"], replaceAffiliateId: method === "affiliate_id" ? true : config.shopee.replaceAffiliateId }
        : platform === "lazada"
          ? { ...config.lazada, primarySource: method as LazadaConfig["primarySource"] }
          : config.tiktokShop;

    const validationErrors = validatePlatformConfig(platform, platformConfig, testUrl);
    if (validationErrors.length > 0) {
      const message = validationErrors.join(". ");
      setTests((current) => setMethodLoading(current, platform, method, { status: "failed", loading: false, message }));
      toast.error(message);
      return;
    }

    setTests((current) => setMethodLoading(current, platform, method, { loading: true, message: null }));
    try {
      const result = await testPlatformConversion(platform, platformConfig, testUrl);
      const message = result.converted ? `Link test: ${result.converted}` : "Test thành công.";
      setTests((current) => setMethodLoading(current, platform, method, { status: "passed", loading: false, message }));
      toast.success("Test phương thức thành công.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test phương thức thất bại.";
      setTests((current) => setMethodLoading(current, platform, method, { status: "failed", loading: false, message }));
      toast.error(message);
    }
  };

  if (query.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title="Affiliate Settings" subtitle="Đang tải cấu hình phương thức chuyển đổi." />
        <SectionCard>
          <div className="loading-row"><RefreshCw className="animate-spin" size={18} aria-hidden /> Đang tải cấu hình...</div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="page-stack affiliate-settings-page">
      <PageHeader
        title="Cấu hình Affiliate"
        subtitle="Mỗi nền tảng có card riêng; mỗi phương thức có cấu hình, trạng thái và nút test riêng để tránh trộn credential."
        actions={<><Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>Làm mới</Button><Button icon={<Save aria-hidden />} onClick={saveCurrent} disabled={save.isPending}>Lưu tất cả</Button></>}
      />

      <div className="affiliate-platform-grid">
        <ShopeeAffiliateCard
          config={config.shopee}
          tests={tests.shopee}
          isSaving={save.isPending}
          onChange={(patch) => updateConfig({ ...config, shopee: { ...config.shopee, ...patch } })}
          onSave={() => save.mutate({ ...config })}
          onTest={(method) => void runTest("shopee", method)}
        />

        <LazadaAffiliateCard
          config={config.lazada}
          tests={tests.lazada}
          isSaving={save.isPending}
          onChange={(patch) => updateConfig({ ...config, lazada: { ...config.lazada, ...patch } })}
          onSave={() => save.mutate({ ...config })}
          onTest={(method) => void runTest("lazada", method)}
        />

        <TikTokAffiliateCard
          config={config.tiktokShop}
          test={tests.tiktok.accesstrade}
          isSaving={save.isPending}
          onChange={(patch) => updateConfig({ ...config, tiktokShop: { ...config.tiktokShop, ...patch } })}
          onSave={() => save.mutate({ ...config })}
          onTest={() => void runTest("tiktok", "accesstrade")}
        />
      </div>

      <SectionCard title="Quy tắc link không hỗ trợ" description="Áp dụng khi caption có URL không thuộc Shopee, Lazada hoặc TikTok Shop.">
        <div className="form-grid">
          <label>
            <Label>Hành động mặc định</Label>
            <Select value={config.unknownLinkAction} onChange={(event) => updateConfig({ ...config, unknownLinkAction: event.target.value })}>
              <option value="saved_for_review">Đưa vào Link lỗi cần xử lý</option>
              <option value="keep">Giữ nguyên trong caption</option>
              <option value="remove">Gỡ khỏi caption</option>
            </Select>
          </label>
          <div className="actions">
            <Button icon={<Save aria-hidden />} onClick={saveCurrent} disabled={save.isPending}>Lưu cấu hình affiliate</Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
