import { describe, expect, it } from "vitest";
import { groupRawMessagesIntoPackages, type RawMessageForGrouping } from "../packages/core/src/content/grouping";

function message(input: Partial<RawMessageForGrouping> & { id: string; text?: string }): RawMessageForGrouping {
  return {
    id: input.id,
    platform: input.platform ?? "telegram",
    sourceId: input.sourceId ?? "source-1",
    sourceChannelId: input.sourceChannelId ?? "channel-deal",
    senderId: input.senderId ?? "sender-a",
    senderName: input.senderName ?? "Chị Mai săn deal",
    text: input.text ?? "",
    media: input.media ?? [],
    links: input.links ?? [],
    replyToMessageId: input.replyToMessageId,
    mediaGroupId: input.mediaGroupId,
    createdAt: input.createdAt ?? new Date("2026-06-21T03:00:00.000Z")
  };
}

describe("content package grouping", () => {
  it("gom chắc chắn các ảnh cùng mediaGroupId thành một content package", () => {
    const packages = groupRawMessagesIntoPackages([
      message({ id: "m1", text: "", mediaGroupId: "album-1", media: [{ type: "image", url: "https://img/1.jpg" }] }),
      message({ id: "m2", text: "Máy hút bụi giảm còn 299k", mediaGroupId: "album-1", media: [{ type: "image", url: "https://img/2.jpg" }] }),
      message({ id: "m3", text: "Link đây https://shopee.vn/may-hut-bui-i.1.2", mediaGroupId: "album-1" })
    ]);

    expect(packages).toHaveLength(1);
    expect(packages[0].rawMessageIds).toEqual(["m1", "m2", "m3"]);
    expect(packages[0].groupedText).toContain("Máy hút bụi giảm còn 299k");
    expect(packages[0].links).toEqual(["https://shopee.vn/may-hut-bui-i.1.2"]);
    expect(packages[0].media).toHaveLength(2);
    expect(packages[0].groupingReason).toContain("album");
  });

  it("gom tin cùng sender trong cửa sổ thời gian dù có người khác chen ngang", () => {
    const base = new Date("2026-06-21T03:00:00.000Z").getTime();
    const packages = groupRawMessagesIntoPackages([
      message({ id: "a1", text: "[Ảnh nồi chiên]", createdAt: new Date(base), media: [{ type: "image", url: "https://img/noi.jpg" }] }),
      message({ id: "b1", senderId: "sender-b", senderName: "Bạn hỏi giá", text: "Cái này còn không?", createdAt: new Date(base + 10_000) }),
      message({ id: "a2", text: "Link đây nha https://shopee.vn/noi-chien-i.3.4", createdAt: new Date(base + 30_000) }),
      message({ id: "a3", text: "Mã giảm thêm 50k", createdAt: new Date(base + 45_000) })
    ]);

    const senderA = packages.find((item) => item.senderId === "sender-a");
    const senderB = packages.find((item) => item.senderId === "sender-b");

    expect(packages).toHaveLength(2);
    expect(senderA?.rawMessageIds).toEqual(["a1", "a2", "a3"]);
    expect(senderA?.groupedText).toContain("Mã giảm thêm 50k");
    expect(senderB?.rawMessageIds).toEqual(["b1"]);
  });

  it("tách package khi cùng sender chuyển sang link sản phẩm khác", () => {
    const base = new Date("2026-06-21T03:00:00.000Z").getTime();
    const packages = groupRawMessagesIntoPackages([
      message({ id: "m1", text: "Máy hút bụi ngon https://shopee.vn/may-hut-bui-i.1.2", createdAt: new Date(base) }),
      message({ id: "m2", text: "Mã giảm thêm 50k", createdAt: new Date(base + 20_000) }),
      message({ id: "m3", text: "Deal tiếp theo nồi chiên https://shopee.vn/noi-chien-i.3.4", createdAt: new Date(base + 40_000) })
    ]);

    expect(packages).toHaveLength(2);
    expect(packages[0].rawMessageIds).toEqual(["m1", "m2"]);
    expect(packages[1].rawMessageIds).toEqual(["m3"]);
    expect(packages[1].groupingReason).toContain("sản phẩm mới");
  });
});
