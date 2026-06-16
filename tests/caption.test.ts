import { describe, expect, it } from "vitest";
import { formatCaptionForPlatform, platformCaptionLimit } from "../packages/core/src/content/caption.js";

describe("formatCaptionForPlatform", () => {
  it("keeps long caption intact for Facebook/Telegram", () => {
    const text = "Deal ngon ".repeat(40) + "https://s.shopee.vn/abc";
    expect(formatCaptionForPlatform(text, "facebook")).toContain("https://s.shopee.vn/abc");
    expect(formatCaptionForPlatform(text, "telegram").length).toBeLessThanOrEqual(4096);
  });

  it("truncates for X (280) and keeps the affiliate URL", () => {
    const url = "https://s.shopee.vn/deal123";
    const text = "Sản phẩm siêu hot giảm giá cực mạnh ".repeat(20) + url;
    const out = formatCaptionForPlatform(text, "x");
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out).toContain(url);
    expect(out).toContain("…");
  });

  it("collapses excessive blank lines", () => {
    const out = formatCaptionForPlatform("a\n\n\n\n\nb", "telegram");
    expect(out).toBe("a\n\nb");
  });

  it("produces different captions for X vs Facebook from the same deal", () => {
    const url = "https://s.shopee.vn/x";
    const deal = "Mô tả deal rất dài ".repeat(30) + url;
    const x = formatCaptionForPlatform(deal, "x");
    const fb = formatCaptionForPlatform(deal, "facebook");
    expect(x).not.toBe(fb);
    expect(x.length).toBeLessThan(fb.length);
  });

  it("respects custom maxLength override", () => {
    expect(formatCaptionForPlatform("hello world this is long", "telegram", { maxLength: 10 }).length).toBeLessThanOrEqual(11);
  });

  it("exposes platform limits", () => {
    expect(platformCaptionLimit("x")).toBe(280);
    expect(platformCaptionLimit("facebook")).toBe(63206);
  });
});
