import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZaloPersonalAdapter, type AdapterAccount, type RawSourceItem } from "@zerun/adapters";

type TestableZaloAdapter = ZaloPersonalAdapter & {
  toRawItem(account: AdapterAccount, message: { threadId: string; data: Record<string, unknown> }): Promise<RawSourceItem | null>;
};

const tempRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.MEDIA_UPLOAD_ROOT;
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Zalo personal adapter", () => {
  it("extracts Vietnamese text, commerce links and local media from attachment messages", async () => {
    const uploadRoot = await mkdtemp(path.join(tmpdir(), "zerun-zalo-media-"));
    tempRoots.push(uploadRoot);
    process.env.MEDIA_UPLOAD_ROOT = uploadRoot;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/jpeg" },
      status: 200
    })));

    const account: AdapterAccount = {
      id: "zalo-source-1",
      platform: "zalo-personal",
      name: "MẸ CỐM - SĂN SALE SÀN 🍊",
      credentials: {
        imei: "imei-1",
        userAgent: "Mozilla/5.0",
        cookie: [{ name: "zpsid", value: "cookie-value" }]
      },
      config: { threadId: "group-1" }
    };
    const adapter = new ZaloPersonalAdapter() as TestableZaloAdapter;

    const item = await adapter.toRawItem(account, {
      threadId: "group-1",
      data: {
        msgId: 987654321,
        msgType: "chat.photo",
        uidFrom: "user-1",
        dName: "Hồ Thị Thanh Tâm",
        ts: "1790123456789",
        content: {
          title: "LỖI GIÁ hay Rẻ nhờ ? 😳 Thả deal sáng sớm cho các bác lum nhaa",
          description: "Trời ơi Sale rẻ đã man 😍 https://s.shopee.vn/4Vae4wdRJf",
          thumb: "https://photo-zalo.example/cdn/photo-thumb",
          params: JSON.stringify({
            caption: "Deal hôm nay: Áo khoác chống nắng giảm 45%, freeship toàn quốc.",
            media: {
              hdUrl: "https://photo-zalo.example/cdn/photo-hd"
            }
          })
        }
      }
    });

    expect(item?.externalId).toBe("987654321");
    expect(item?.author).toBe("Hồ Thị Thanh Tâm");
    expect(item?.text).toContain("LỖI GIÁ hay Rẻ nhờ");
    expect(item?.text).toContain("https://s.shopee.vn/4Vae4wdRJf");
    expect(item?.text).toContain("Áo khoác chống nắng");
    expect(item?.media).toHaveLength(2);
    expect(item?.media[0]?.type).toBe("image");
    expect(item?.media[0]?.localPath).toBeTruthy();
    await expect(stat(item?.media[0]?.localPath ?? "")).resolves.toMatchObject({ size: 3 });
  });
});
