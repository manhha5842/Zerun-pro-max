import { describe, expect, it } from "vitest";
import { detectLinks } from "./detect.js";

describe("detectLinks", () => {
  it("giữ tiếng Việt có dấu và phát hiện link thương mại điện tử", () => {
    const text = "Deal hôm nay: Áo khoác chống nắng giảm 45% https://shopee.vn/ao-khoac?sku=123";
    const links = detectLinks(text);

    expect(text).toContain("Áo khoác chống nắng");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      url: "https://shopee.vn/ao-khoac?sku=123",
      network: "shopee",
      supported: true
    });
  });
});
