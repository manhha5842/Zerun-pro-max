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

    const response = await fetch(`${this.apiBaseUrl}/v1/product_link/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${this.token}`
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        urls: [input.url],
        sub1: input.subId,
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
