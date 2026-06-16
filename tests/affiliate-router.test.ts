import { describe, expect, it, vi } from "vitest";
import { detectNetwork } from "../packages/core/src/links/detect.js";
import { AffiliateRouter } from "../packages/adapters/src/affiliate/router.js";
import type { AffiliateAdapter, ConvertLinkInput, ConvertLinkResult } from "../packages/adapters/src/contracts.js";

function fakeAdapter(tag: string): AffiliateAdapter {
  return {
    detect: () => [],
    convert: vi.fn(async (input: ConvertLinkInput): Promise<ConvertLinkResult> => ({
      original: input.url,
      converted: `${tag}:${input.url}`,
      network: input.network,
      success: true
    }))
  };
}

describe("detectNetwork (M3-C1 tiki/sendo)", () => {
  it("detects tiki and sendo", () => {
    expect(detectNetwork("https://tiki.vn/san-pham-p123.html")).toBe("tiki");
    expect(detectNetwork("https://www.sendo.vn/abc")).toBe("sendo");
  });
});

describe("AffiliateRouter routing", () => {
  it("routes tiki/sendo to fallback (AccessTrade) when no specific provider", async () => {
    const fallback = fakeAdapter("fallback");
    const router = new AffiliateRouter({ fallback });
    const tiki = await router.convert({ url: "https://tiki.vn/x", network: "tiki" });
    const sendo = await router.convert({ url: "https://sendo.vn/y", network: "sendo" });
    expect(tiki.converted).toBe("fallback:https://tiki.vn/x");
    expect(sendo.converted).toBe("fallback:https://sendo.vn/y");
  });

  it("routes to the specific provider when present, falls back on error", async () => {
    const fallback = fakeAdapter("fallback");
    const shopee = fakeAdapter("shopee");
    const router = new AffiliateRouter({ providers: { shopee }, fallback });
    const res = await router.convert({ url: "https://shopee.vn/x", network: "shopee" });
    expect(res.converted).toBe("shopee:https://shopee.vn/x");

    const failing: AffiliateAdapter = { detect: () => [], convert: vi.fn(async () => { throw new Error("boom"); }) };
    const router2 = new AffiliateRouter({ providers: { shopee: failing }, fallback });
    const res2 = await router2.convert({ url: "https://shopee.vn/y", network: "shopee" });
    expect(res2.converted).toBe("fallback:https://shopee.vn/y");
  });
});
