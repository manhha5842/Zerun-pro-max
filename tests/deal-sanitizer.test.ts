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

  it("keeps voucher codes and promo info while only removing traffic-dragging elements", () => {
    const input = [
      "🔥BÀO TIẾP MÃ FB 22%, VIP 30%",
      "🎀MÃ ĐỘC QUYỀN MXH",
      "🎀Mã dưới cần đổi link",
      "🎀Đang ế mã toàn sàn 22%",
      "🎀Back mã giảm 30% tại: https://s.shopee.vn/an_redir",
      "➖➖➖➖➖➖",
      "🎟 MÃ Shopee 2 TRIỆU"
    ].join("\n");

    const output = sanitizeDealText(input);

    expect(output).toContain("22%, VIP 30%");
    expect(output).toContain("MÃ ĐỘC QUYỀN MXH");
    expect(output).toContain("Mã dưới cần đổi link");
    expect(output).toContain("Back mã giảm 30%");
    expect(output).toContain("MÃ Shopee 2 TRIỆU");
    expect(output).toContain("https://s.shopee.vn/an_redir");
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
