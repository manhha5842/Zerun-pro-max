import { describe, expect, it } from "vitest";
import { computeContentHashes, isContentDuplicate } from "./dedup.js";

const SHOPEE_LINK_A = "https://shopee.vn/ao-khoac-p123?utm_source=facebook&ref=abc";
const SHOPEE_LINK_B = "https://shopee.vn/ao-khoac-p123?utm_medium=social";
const SHOPEE_LINK_OTHER = "https://shopee.vn/giay-dep-p999";

describe("computeContentHashes", () => {
  it("cùng link sản phẩm, khác tracking param → linkHash bằng nhau", () => {
    const a = computeContentHashes("Deal hôm nay 50%", [SHOPEE_LINK_A]);
    const b = computeContentHashes("Deal khác caption nhưng cùng link", [SHOPEE_LINK_B]);
    expect(a.linkHash).toBe(b.linkHash);
  });

  it("link sản phẩm khác nhau → linkHash khác nhau", () => {
    const a = computeContentHashes("text", [SHOPEE_LINK_A]);
    const b = computeContentHashes("text", [SHOPEE_LINK_OTHER]);
    expect(a.linkHash).not.toBe(b.linkHash);
  });

  it("không có link sản phẩm → textHash dùng để phân biệt", () => {
    const a = computeContentHashes("Mua ngay tại đây!", []);
    const b = computeContentHashes("Sản phẩm khác hoàn toàn!", []);
    expect(a.textHash).not.toBe(b.textHash);
  });

  it("link sản phẩm được sort trước khi hash → thứ tự không quan trọng", () => {
    const a = computeContentHashes("text", [SHOPEE_LINK_A, SHOPEE_LINK_OTHER]);
    const b = computeContentHashes("text", [SHOPEE_LINK_OTHER, SHOPEE_LINK_A]);
    expect(a.linkHash).toBe(b.linkHash);
  });
});

describe("isContentDuplicate", () => {
  it("cùng link sản phẩm → trùng", () => {
    const a = computeContentHashes("caption A", [SHOPEE_LINK_A]);
    const b = computeContentHashes("caption B khác", [SHOPEE_LINK_B]);
    expect(isContentDuplicate(a, b)).toBe(true);
  });

  it("link sản phẩm khác → không trùng", () => {
    const a = computeContentHashes("text", [SHOPEE_LINK_A]);
    const b = computeContentHashes("text", [SHOPEE_LINK_OTHER]);
    expect(isContentDuplicate(a, b)).toBe(false);
  });

  it("không có link sản phẩm, text giống → trùng qua textHash", () => {
    const text = "Voucher giảm 30k đơn từ 150k";
    const a = computeContentHashes(text, []);
    const b = computeContentHashes(text, []);
    expect(isContentDuplicate(a, b)).toBe(true);
  });

  it("không có link sản phẩm, text khác → không trùng", () => {
    const a = computeContentHashes("Text A hoàn toàn khác", []);
    const b = computeContentHashes("Text B hoàn toàn khác", []);
    expect(isContentDuplicate(a, b)).toBe(false);
  });
});
