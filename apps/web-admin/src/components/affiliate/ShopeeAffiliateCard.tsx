import { useMemo, useState } from "react";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import { AffiliateMethodCard } from "./AffiliateMethodCard";
import { PlatformAffiliateCard, type AffiliateMethodOption } from "./PlatformAffiliateCard";
import { SubIdFields } from "./SubIdFields";
import type { MethodStatus } from "./MethodStatusBadge";
import type { ShopeeConfig } from "../../services/affiliateService";

type ShopeeMethod = ShopeeConfig["primarySource"];

export type MethodTestState = {
  status?: "passed" | "failed";
  loading?: boolean;
  message?: string | null;
};

type ShopeeAffiliateCardProps = {
  config: ShopeeConfig;
  tests: Partial<Record<ShopeeMethod, MethodTestState>>;
  isSaving?: boolean;
  onChange: (patch: Partial<ShopeeConfig>) => void;
  onSave: () => void;
  onTest: (method: ShopeeMethod) => void;
};

function testAwareStatus(configured: boolean, test?: MethodTestState, comingSoon = false): MethodStatus {
  if (comingSoon) return "coming_soon";
  if (test?.status === "passed") return "test_passed";
  if (test?.status === "failed") return "test_failed";
  return configured ? "configured" : "not_configured";
}

function platformStatus(enabled: boolean, methods: Array<AffiliateMethodOption<ShopeeMethod>>) {
  if (!enabled) return "disabled" as const;
  if (methods.some((method) => method.status === "test_failed")) return "test_failed" as const;
  if (methods.some((method) => method.status === "test_passed")) return "test_success" as const;
  if (methods.some((method) => method.status === "configured")) return "ready" as const;
  return "missing" as const;
}

export function ShopeeAffiliateCard({ config, tests, isSaving, onChange, onSave, onTest }: ShopeeAffiliateCardProps) {
  const [expanded, setExpanded] = useState<Record<ShopeeMethod, boolean>>({
    web: true,
    affiliate_id: false,
    accesstrade: false
  });

  const methods = useMemo<Array<AffiliateMethodOption<ShopeeMethod>>>(() => [
    {
      value: "web",
      label: "Zerun Extension",
      status: testAwareStatus(true, tests.web)
    },
    {
      value: "accesstrade",
      label: "AccessTrade",
      status: testAwareStatus(Boolean(config.accessTradeToken.trim() && config.campaignId.trim()), tests.accesstrade)
    }
  ], [config.accessTradeToken, config.campaignId, tests]);

  const setMethodExpanded = (method: ShopeeMethod) => {
    setExpanded((current) => ({ ...current, [method]: !current[method] }));
  };

  return (
    <PlatformAffiliateCard<ShopeeMethod>
      platformName="Shopee"
      description="Convert link Shopee thông qua Extension hoặc AccessTrade. Tự động thay thế nóng nếu link có sẵn affiliate_id."
      accent="#ee4d2d"
      enabled={config.enabled}
      status={platformStatus(config.enabled, methods)}
      defaultMethod={config.primarySource === "affiliate_id" ? "web" : config.primarySource}
      methods={methods}
      isSaving={isSaving}
      onEnabledChange={(enabled) => onChange({ enabled })}
      onDefaultMethodChange={(primarySource) => {
        const fallbackSource = primarySource === "web" ? "accesstrade" : "web";
        onChange({ primarySource, fallbackSource, useFallback: true });
      }}
      onSave={onSave}
    >
      <AffiliateMethodCard
        id="shopee-web"
        title="Zerun Extension"
        description="Dùng extension đang cài trong Chrome/Edge để gọi batchCustomLink bằng session Shopee Affiliate hiện có."
        requirement="Yêu cầu: extension đã kết nối WebSocket ws://localhost:17385 và tài khoản Shopee Affiliate đã đăng nhập trong browser."
        status={methods[0].status}
        expanded={expanded.web}
        disabled={!config.enabled}
        testLabel="Test Extension"
        testLoading={tests.web?.loading}
        result={tests.web?.status === "passed" ? tests.web.message ?? "Extension test thành công." : null}
        error={tests.web?.status === "failed" ? tests.web.message ?? "Extension test thất bại." : null}
        onToggle={() => setMethodExpanded("web")}
        onTest={() => onTest("web")}
      >
        <div className="form-grid">
          <label>
            <Label>Shopee Affiliate ID để tự thay thế nhanh</Label>
            <Input value={config.affiliateId} onChange={(event) => onChange({ affiliateId: event.target.value, replaceAffiliateId: true })} disabled={!config.enabled} placeholder="Nhập affiliate_id của bạn" />
          </label>
        </div>
        <SubIdFields subIds={config.subIds} maxFields={5} onChange={(field, value) => onChange({ subIds: { ...config.subIds, [field]: value } })} disabled={!config.enabled} />
      </AffiliateMethodCard>

      <AffiliateMethodCard
        id="shopee-accesstrade"
        title="AccessTrade"
        description="Dùng AccessTrade Product Link API khi không muốn thao tác qua browser."
        status={methods[1].status}
        expanded={expanded.accesstrade}
        disabled={!config.enabled}
        testLabel="Test AccessTrade"
        testDisabled={!config.accessTradeToken.trim() || !config.campaignId.trim()}
        testLoading={tests.accesstrade?.loading}
        result={tests.accesstrade?.status === "passed" ? tests.accesstrade.message ?? "AccessTrade test thành công." : null}
        error={tests.accesstrade?.status === "failed" ? tests.accesstrade.message ?? "AccessTrade test thất bại." : null}
        onToggle={() => setMethodExpanded("accesstrade")}
        onTest={() => onTest("accesstrade")}
      >
        <div className="form-grid">
          <label>
            <Label>AccessTrade Token</Label>
            <Input type="password" value={config.accessTradeToken} onChange={(event) => onChange({ accessTradeToken: event.target.value })} disabled={!config.enabled} />
          </label>
          <label>
            <Label>Campaign ID</Label>
            <Input value={config.campaignId} onChange={(event) => onChange({ campaignId: event.target.value })} disabled={!config.enabled} />
          </label>
        </div>
      </AffiliateMethodCard>
    </PlatformAffiliateCard>
  );
}
