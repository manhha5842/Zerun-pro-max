import { detectLinks } from "@zerun/core";
import { ConfigurationError } from "@zerun/shared";
import type { DetectedLink } from "@zerun/shared";
import type { AffiliateAdapter, ConvertLinkInput, ConvertLinkResult } from "../contracts.js";
import { AccessTradeAffiliateAdapter } from "./accesstrade.js";

/**
 * Shopee Affiliate Adapter — 2 mode:
 * - "accesstrade": dùng AccessTrade API (default, không cần session browser)
 * - "web": batchCustomLink qua Playwright page.evaluate (cần browser session + cookie)
 * - "auto": thử web trước, fallback AccessTrade nếu lỗi/chưa có session
 *
 * 📘 docs/tutorials/shopee-affiliate-converter.md
 */

export type ShopeeAffiliateMode = "accesstrade" | "web" | "auto";

export type ShopeeAffiliateOptions = {
  mode?: ShopeeAffiliateMode;
  /** AccessTrade options (dùng khi mode=accesstrade hoặc fallback). */
  accessTradeToken?: string;
  accessTradeCampaignId?: string;
  /** Callback lấy Playwright page để gọi web API (chỉ cần khi mode=web/auto). */
  getPage?: () => Promise<ShopeeWebPage | null>;
};

export type ShopeeWebPage = {
  evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
};

export class ShopeeAffiliateAdapter implements AffiliateAdapter {
  private readonly mode: ShopeeAffiliateMode;
  private readonly accessTrade: AccessTradeAffiliateAdapter;
  private readonly getPage: (() => Promise<ShopeeWebPage | null>) | undefined;

  constructor(options: ShopeeAffiliateOptions = {}) {
    this.mode = options.mode ?? "accesstrade";
    this.accessTrade = new AccessTradeAffiliateAdapter({
      token: options.accessTradeToken,
      defaultCampaignId: options.accessTradeCampaignId
    });
    this.getPage = options.getPage;
  }

  detect(text: string): DetectedLink[] {
    return detectLinks(text);
  }

  async convert(input: ConvertLinkInput): Promise<ConvertLinkResult> {
    if (this.mode === "accesstrade") {
      return this.convertViaAccessTrade(input);
    }
    if (this.mode === "web") {
      return this.convertViaWeb(input);
    }
    // auto: thử web trước, fallback AccessTrade
    const webResult = await this.convertViaWeb(input);
    if (webResult.success) return webResult;
    return this.convertViaAccessTrade(input);
  }

  private async convertViaAccessTrade(input: ConvertLinkInput): Promise<ConvertLinkResult> {
    return this.accessTrade.convert(input);
  }

  private async convertViaWeb(input: ConvertLinkInput): Promise<ConvertLinkResult> {
    if (!this.getPage) {
      return { original: input.url, converted: null, network: "shopee", success: false, error: "Chưa cấu hình getPage (web mode)" };
    }

    const page = await this.getPage();
    if (!page) {
      return { original: input.url, converted: null, network: "shopee", success: false, error: "Không lấy được Shopee session browser" };
    }

    try {
      const subId = input.subId ?? "zerun";
      const result = await page.evaluate(
        async (...args: unknown[]) => {
          const [url, sid] = args as [string, string];
          const body = {
            requests: [
              {
                requestType: "CREATE_CUSTOM_LINK",
                createCustomLinkRequest: {
                  originUrl: url,
                  subId1: sid
                }
              }
            ]
          };
          const res = await fetch("https://affiliate.shopee.vn/api/v2/product_link/batch", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          if (!res.ok) return { error: `HTTP ${res.status}`, converted: null };
          const data = await res.json() as {
            responses?: Array<{
              createCustomLinkResponse?: { affiliateLink?: string };
              errorCode?: number;
              errorMessage?: string;
            }>;
          };
          const first = data.responses?.[0];
          if (!first) return { error: "Không có response", converted: null };
          if (first.errorCode && first.errorCode !== 0) {
            // Lỗi 14 = chưa đăng nhập
            return { error: `errorCode ${first.errorCode}: ${first.errorMessage ?? ""}`, converted: null };
          }
          return { converted: first.createCustomLinkResponse?.affiliateLink ?? null };
        },
        input.url,
        subId
      );

      if (result.converted) {
        return { original: input.url, converted: result.converted, network: "shopee", success: true };
      }
      return { original: input.url, converted: null, network: "shopee", success: false, error: result.error ?? "Không tạo được link" };
    } catch (error) {
      return { original: input.url, converted: null, network: "shopee", success: false, error: (error as Error).message };
    }
  }
}
