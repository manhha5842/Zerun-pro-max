import { describe, expect, it } from "vitest";
import { evaluateRules, sanitizeDealText } from "../packages/core/src/index.js";
import type { SourceProfile } from "../packages/core/src/rules/source-profile.js";

const trustedSource: SourceProfile = {
  id: "src-test",
  type: "voucher_deal_group",
  mainPlatforms: ["shopee"],
  enabledCategories: [],
  acceptedCategories: [],
  trustLevel: "high",
  allowAutoPublish: true
};

describe("deal sanitizer", () => {
  it("removes source-channel instruction lines while keeping the main deal link", () => {
    const input = [
      "NHANH: https://s.lazada.vn/s.NCHb6?c=d&t=p-i3ZkDg9-sHHFP0n&sub_id6=TMALL",
      "",
      "❌ Nhớ áp full mã + xu 👉 https://t.me/clubmuare/136249"
    ].join("\n");

    const output = sanitizeDealText(input);

    expect(output).toContain("https://s.lazada.vn/s.NCHb6");
    expect(output).not.toContain("Nhớ áp full mã");
    expect(output).not.toContain("t.me/clubmuare");
  });

  it("removes tutorial/source blocks from a noisy Shopee voucher message", () => {
    const input = [
      "🔥BÀO TIẾP MÃ FB ( XEM HD: t.me/clubmuare/134713 ) 22%, VIP 30%",
      "🎀MÃ ĐỘC QUYỀN MXH, XEM HD: t.me/clubmuare/134713",
      "Mã dưới cần đổi link",
      "🎀Đang ế mã toàn sàn 22% tại: https://t.me/shopeeooo_bot",
      "🎀Back mã giảm 30% tại: https://s.shopee.vn/an_redir?origin_link=https%3A%2F%2Fshopee.vn%2Fm%2Fgoi-ShopeeVIP&affiliate_id=17385530062&sub_id=shp2",
      "➖➖➖➖➖➖",
      "🎟 MÃ Shopee 2 TRIỆU: https://t.me/tagliveshopee/27093",
      "🔴 Tᴑᴑl lấy mã 👉 https://shopee.ooo"
    ].join("\n");

    const output = sanitizeDealText(input);

    expect(output).toContain("22%, VIP 30%");
    expect(output).toContain("https://s.shopee.vn/an_redir");
    expect(output).not.toContain("XEM HD");
    expect(output).not.toContain("MÃ ĐỘC QUYỀN");
    expect(output).not.toContain("shopeeooo_bot");
    expect(output).not.toContain("tagliveshopee");
    expect(output).not.toContain("shopee.ooo");
  });

  it("does not skip useful announcement messages without links", () => {
    const result = evaluateRules({
      text: "Tối nay có mã mới cho ngành mẹ và bé, mình sẽ cập nhật thêm khi sàn mở mã.",
      sourceProfile: trustedSource,
      hasImage: false
    });

    expect(result.verdict).toBe("proceed");
    expect(result.needAi).toBe(true);
  });
});
