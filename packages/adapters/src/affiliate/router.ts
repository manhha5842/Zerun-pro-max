import type { DetectedLink, LinkNetwork } from "@zerun/shared";
import type { AffiliateAdapter, ConvertLinkInput, ConvertLinkResult } from "../contracts.js";
import { AccessTradeAffiliateAdapter } from "./accesstrade.js";

/**
 * AffiliateRouter — route convert theo network:
 * - shopee → ShopeeAffiliateAdapter (web API hoặc AccessTrade, configurable)
 * - lazada → LazadaAffiliateAdapter (official API, token pending)
 * - tiktok_shop / tiki / sendo / unknown → AccessTrade fallback
 *
 * Mỗi provider có thể override trong constructor options.
 * Thiếu provider → fallback AccessTrade.
 */
export class AffiliateRouter implements AffiliateAdapter {
  private readonly providers: Partial<Record<LinkNetwork, AffiliateAdapter>>;
  private readonly fallback: AffiliateAdapter;

  constructor(options: AffiliateRouterOptions = {}) {
    this.fallback = options.fallback ?? new AccessTradeAffiliateAdapter();
    this.providers = options.providers ?? {};
  }

  detect(text: string): DetectedLink[] {
    return this.fallback.detect(text);
  }

  async convert(input: ConvertLinkInput): Promise<ConvertLinkResult> {
    const provider = this.providers[input.network] ?? this.fallback;
    try {
      return await provider.convert(input);
    } catch (error) {
      if (provider === this.fallback) throw error;
      // Provider chính lỗi → thử fallback
      return this.fallback.convert(input);
    }
  }
}

export type AffiliateRouterOptions = {
  /** Provider cụ thể theo network. Những network không có → dùng fallback. */
  providers?: Partial<Record<LinkNetwork, AffiliateAdapter>>;
  /** Fallback khi không có provider phù hợp (default: AccessTradeAffiliateAdapter). */
  fallback?: AffiliateAdapter;
};
