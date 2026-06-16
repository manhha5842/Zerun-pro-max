import { detectLinks } from "@zerun/core";
import { ConfigurationError, type DetectedLink } from "@zerun/shared";
import type { AffiliateAdapter, ConvertLinkInput, ConvertLinkResult } from "../contracts.js";

type AccessTradeOptions = {
  token?: string;
  apiBaseUrl?: string;
  defaultCampaignId?: string;
};

export class AccessTradeAffiliateAdapter implements AffiliateAdapter {
  private readonly token?: string;
  private readonly apiBaseUrl: string;
  private readonly defaultCampaignId?: string;

  constructor(options: AccessTradeOptions = {}) {
    this.token = options.token ?? process.env.ACCESSTRADE_API_KEY;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.accesstrade.vn";
    this.defaultCampaignId = options.defaultCampaignId ?? process.env.ACCESSTRADE_DEFAULT_CAMPAIGN_ID;
  }

  detect(text: string): DetectedLink[] {
    return detectLinks(text);
  }

  async convert(input: ConvertLinkInput): Promise<ConvertLinkResult> {
    const campaignId = input.campaignId ?? this.defaultCampaignId;
    if (!this.token) throw new ConfigurationError("Thiếu ACCESSTRADE_API_KEY");
    if (!campaignId) throw new ConfigurationError("Thiếu campaignId cho AccessTrade");

    let targetUrl = input.url;
    let sub1 = input.subId;
    let sub2: string | undefined;
    let sub3: string | undefined;
    let sub4: string | undefined;

    if (input.subId) {
      try {
        if (input.subId.startsWith("{") && input.subId.endsWith("}")) {
          const parsed = JSON.parse(input.subId);
          sub1 = parsed.sub1 || parsed.sub_1 || undefined;
          sub2 = parsed.sub2 || parsed.sub_2 || undefined;
          sub3 = parsed.sub3 || parsed.sub_3 || undefined;
          sub4 = parsed.sub4 || parsed.sub_4 || undefined;

          // Gắn UTM parameters vào target URL gốc
          const urlObj = new URL(targetUrl);
          const utmSource = parsed.utmSource || parsed.utm_source;
          const utmMedium = parsed.utmMedium || parsed.utm_medium;
          const utmCampaign = parsed.utmCampaign || parsed.utm_campaign;
          const utmContent = parsed.utmContent || parsed.utm_content;

          if (utmSource) urlObj.searchParams.set("utm_source", utmSource);
          if (utmMedium) urlObj.searchParams.set("utm_medium", utmMedium);
          if (utmCampaign) urlObj.searchParams.set("utm_campaign", utmCampaign);
          if (utmContent) urlObj.searchParams.set("utm_content", utmContent);
          
          targetUrl = urlObj.toString();
        }
      } catch {
        // Không phải JSON, giữ nguyên sub1 làm input.subId
      }
    }

    const response = await fetch(`${this.apiBaseUrl}/v1/product_link/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${this.token}`
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        urls: [targetUrl],
        sub1: sub1 || undefined,
        sub2: sub2 || undefined,
        sub3: sub3 || undefined,
        sub4: sub4 || undefined,
        url_enc: true
      })
    });

    if (!response.ok) {
      return {
        original: input.url,
        converted: null,
        network: input.network,
        success: false,
        error: `AccessTrade HTTP ${response.status}`
      };
    }

    const payload = (await response.json()) as {
      data?: {
        success_link?: Array<{ aff_link?: string; short_link?: string; url_origin?: string }>;
        error_link?: unknown[];
      };
      success?: boolean;
    };
    const first = payload.data?.success_link?.[0];
    const converted = first?.short_link ?? first?.aff_link ?? null;

    return {
      original: input.url,
      converted,
      network: input.network,
      success: Boolean(payload.success && converted),
      error: converted ? undefined : "Không tạo được tracking link"
    };
  }
}
