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

  it("phát hiện short link s.lazada.vn là lazada network", () => {
    const text = "Check Nova75 https://s.lazada.vn/s.ndC7v?c=p&t=p-iEbTm67-s23etdhf";
    const links = detectLinks(text);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      url: "https://s.lazada.vn/s.ndC7v?c=p&t=p-iEbTm67-s23etdhf",
      network: "lazada",
      supported: true
    });
  });

  it("phát hiện nhiều link trùng lặp trong text", () => {
    const text = "Check Nova75 https://s.lazada.vn/s.ndC7v?c=p&t=p-iEbTm67-s23etdhf https://s.lazada.vn/s.ndC7v?c=p&t=p-iEbTm67-s23etdhf";
    const links = detectLinks(text);

    expect(links).toHaveLength(2);
    expect(links[0].url).toBe("https://s.lazada.vn/s.ndC7v?c=p&t=p-iEbTm67-s23etdhf");
    expect(links[0].network).toBe("lazada");
  });
});
