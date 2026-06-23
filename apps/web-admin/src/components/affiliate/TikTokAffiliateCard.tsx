import { useState } from "react";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { type TikTokShopConfig } from "../../services/affiliateService";
import { AffiliateMethodCard } from "./AffiliateMethodCard";
import { PlatformAffiliateCard } from "./PlatformAffiliateCard";
import type { MethodStatus } from "./MethodStatusBadge";
import type { MethodTestState } from "./ShopeeAffiliateCard";

type TikTokAffiliateCardProps = {
  config: TikTokShopConfig;
  test?: MethodTestState;
  isSaving?: boolean;
  onChange: (patch: Partial<TikTokShopConfig>) => void;
  onSave: () => void;
  onTest: () => void;
};

function methodStatus(configured: boolean, test?: MethodTestState): MethodStatus {
  if (test?.status === "passed") return "test_passed";
  if (test?.status === "failed") return "test_failed";
  return configured ? "configured" : "not_configured";
}

export function TikTokAffiliateCard({ config, test, isSaving, onChange, onSave, onTest }: TikTokAffiliateCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const configured = Boolean(config.accessTradeToken.trim());
  const status = methodStatus(configured, test);
  const platformStatus = !config.enabled
    ? "disabled"
    : status === "test_failed"
      ? "test_failed"
      : status === "test_passed"
        ? "test_success"
        : configured
          ? "ready"
          : "missing";

  return (
    <PlatformAffiliateCard<"accesstrade">
      platformName="TikTok Shop"
      description="Hiện chỉ hỗ trợ AccessTrade. Tracking nâng cao được gom riêng để tránh rối cấu hình."
      accent="#111827"
      enabled={config.enabled}
      status={platformStatus}
      defaultMethod="accesstrade"
      methods={[{ value: "accesstrade", label: "AccessTrade", status }]}
      hideMethodSelectors
      isSaving={isSaving}
      onEnabledChange={(enabled) => onChange({ enabled })}
      onDefaultMethodChange={() => undefined}
      onSave={onSave}
    >
      <AffiliateMethodCard
        id="tiktok-accesstrade"
        title="AccessTrade"
        description="Dùng AccessTrade token để tạo tracking link TikTok Shop."
        requirement="Yêu cầu tối thiểu: AccessTrade Token. Campaign ID có thể nhập nếu campaign TikTok Shop của bạn cần định tuyến riêng."
        status={status}
        expanded={expanded}
        disabled={!config.enabled}
        testLabel="Test AccessTrade"
        testDisabled={!configured}
        testLoading={test?.loading}
        result={test?.status === "passed" ? test.message ?? "TikTok Shop test thành công." : null}
        error={test?.status === "failed" ? test.message ?? "TikTok Shop test thất bại." : null}
        onToggle={() => setExpanded((value) => !value)}
        onTest={onTest}
      >
        <div className="form-grid">
          <label><Label>AccessTrade Token</Label><Input type="password" value={config.accessTradeToken} onChange={(event) => onChange({ accessTradeToken: event.target.value })} disabled={!config.enabled} /></label>
          <label><Label>Campaign ID optional</Label><Input value={config.campaignId} onChange={(event) => onChange({ campaignId: event.target.value })} disabled={!config.enabled} /></label>
        </div>

        <button type="button" className="advanced-toggle" onClick={() => setShowAdvanced((value) => !value)}>
          {showAdvanced ? "Ẩn tracking nâng cao" : "Mở tracking nâng cao"}
        </button>
        {showAdvanced ? (
          <div className="form-grid">
            {(["utmSource", "utmMedium", "utmCampaign", "utmContent", "sub1", "sub2", "sub3", "sub4"] as const).map((key) => (
              <label key={key}>
                <Label>{key}</Label>
                <Input
                  value={config.tracking[key]}
                  onChange={(event) => onChange({ tracking: { ...config.tracking, [key]: event.target.value } })}
                  disabled={!config.enabled}
                />
              </label>
            ))}
          </div>
        ) : null}
      </AffiliateMethodCard>
    </PlatformAffiliateCard>
  );
}
