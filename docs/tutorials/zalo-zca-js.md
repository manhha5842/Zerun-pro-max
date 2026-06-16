# Tutorial — Zalo personal qua zca-js

> Adapter Zalo cá nhân dùng [`zca-js`](https://github.com/RFS-ADRENO/zca-js) (unofficial).
> Đây là tích hợp Zalo duy nhất của dự án, dùng cho **cả nguồn (listen group) lẫn đích (gửi group)**.

## ⚠️ Cảnh báo trước khi code
- zca-js là **unofficial** → có rủi ro **khóa tài khoản**. **Chỉ dùng acc phụ.**
- **Không** chạy đồng thời nhiều listener bằng cùng một tài khoản.
- Thêm random delay khi gửi, tránh spam.

## 0. Kiến trúc: listener (push) vs crawl (pull) — QUYẾT ĐỊNH TRƯỚC

`SourceAdapter` hiện tại là **pull**: `crawl(input): Promise<CrawlResult>` (Telegram poll theo limit).
zca-js là **push**: listener WebSocket bắn event `message` realtime. Hai mô hình khác nhau → chọn 1:

- **(Khuyến nghị) Thêm `RealtimeSourceAdapter`** + worker `realtime-listener.ts` giữ kết nối sống:
  ```ts
  export interface RealtimeSourceAdapter {
    platform: Platform;
    testConnection(account: AdapterAccount): Promise<AdapterHealth>;
    startListener(account: AdapterAccount, onItem: (item: RawSourceItem) => Promise<void>): Promise<{ stop: () => Promise<void> }>;
  }
  ```
  Sạch, đúng bản chất realtime, tái dùng cho Telegram realtime sau này.
- **(Tạm) Bridge vào crawl:** listener đẩy message vào buffer nội bộ; `crawl()` drain buffer mỗi lần
  poll. Tận dụng runtime poll hiện có nhưng cần process sống giữa các lần poll (kém tự nhiên).

→ Tutorial này code theo hướng **RealtimeSourceAdapter**. `onItem` sẽ gọi cùng hàm lưu
`CrawlResult` mà Telegram đang dùng (giữ dedup `@@unique`).

## 1. Cài & vị trí file
```
npm i zca-js -w @zerun/adapters   # ĐÃ CÀI — v2.1.2
```
```
packages/adapters/src/platforms/zalo-personal.ts   # SourceAdapter + PublishAdapter
```
Theo đúng interface có sẵn: `packages/adapters/src/contracts.ts` (`SourceAdapter`, `PublishAdapter`,
`AdapterHealth`, `CrawlInput/Result`, `PublishInput/Result`). Đăng ký trong `registry.ts`.
Thêm `"zalo-personal"` vào `platforms` ở `packages/shared/src/types.ts`.

> ✅ **API dưới đây đã verify với zca-js v2.1.2** (đọc `node_modules/zca-js/dist/*.d.ts`).
> Nếu bump version, verify lại.

## 2. Đăng nhập (qua Session Manager)
API thật: `new Zalo(options?)`, `loginQR(options?, callback?)`, `login(credentials)`.

```ts
import { Zalo, type Credentials } from "zca-js";

// Lần đầu: QR login. Lưu QR ra file để UI hiển thị cho người quét.
const zalo = new Zalo();
const api = await zalo.loginQR(
  { userAgent: UA, qrPath: "storage/sessions/zalo/<accountId>/qr.png" },
  (event) => { /* LoginQRCallbackEvent: QRCodeGenerated / scanned / ... → đẩy lên UI */ }
);

// Lấy context để LƯU session (re-login sau)
const ctx = api.getContext();           // { uid, imei, cookie: CookieJar, userAgent, language }
const creds: Credentials = {
  imei: ctx.imei,
  userAgent: ctx.userAgent,
  cookie: ctx.cookie.toJSON(),          // serialize CookieJar (tough-cookie)
  language: ctx.language
};
// → lưu creds vào PlatformSession.data (M2: mã hoá)

// Lần sau: login lại không cần QR
const api2 = await new Zalo().login(creds);
```

## 3. Listener (nguồn) → CrawlResult
`api.listener` là EventEmitter. Message = `UserMessage | GroupMessage`:
`message.type` (`ThreadType.Group=1`), `message.threadId`, `message.isSelf`,
`message.data` = `{ msgId, uidFrom, dName, ts, content, quote, ... }`
(`content` là `string` HOẶC object attachment).

```ts
import { ThreadType } from "zca-js";

api.listener.on("message", async (message) => {
  if (message.isSelf) return;                 // bỏ tin do chính mình gửi
  if (message.type !== ThreadType.Group) return; // chỉ lấy group (tùy nhu cầu)
  const d = message.data;
  const text = typeof d.content === "string" ? d.content : "";
  await saveCrawlResult({
    platform: "zalo-personal",
    sourceRef: message.threadId,              // group id
    externalId: d.msgId,                      // dedup @@unique
    author: d.dName ?? d.uidFrom,
    originalText: text,
    media: typeof d.content === "object" ? [d.content] : [],
    postedAt: new Date(Number(d.ts))
  });
});

api.listener.on("connected", () => {/* status=running */});
api.listener.on("disconnected", (code, reason) => {/* relogin/reconnect */});
api.listener.on("error", (e) => {/* log + alert */});
api.listener.start({ retryOnClose: true });   // tự retry khi rớt
// dừng: api.listener.stop();
```
- Dedup tầng DB qua `@@unique([platform, sourceRef, externalId])` của `CrawlResult` (đã có).
- Dedup nội dung đa nguồn: xem [dedup tutorial](dedup-multi-source.md).
- `content` dạng object (link/ảnh) → cần parse riêng để lấy URL (field `href`/`params`).

## 4. Gửi bài (đích)
Signature thật: `sendMessage(message: MessageContent | string, threadId: string, type?: ThreadType)`.
```ts
import { ThreadType } from "zca-js";
await api.sendMessage(
  { msg: finalText, attachments: mediaPaths },  // MessageContent: { msg, attachments? }
  threadId,                                      // group id đích
  ThreadType.Group
);
```
Map vào `PublishAdapter.publish(input: PublishInput): PublishResult` (trả `externalId` từ response;
ghi `PublishAttempt`). Thêm random delay trước khi gửi.

## 5. Crawl lịch sử (nếu cần backfill)
Listener là realtime. Backfill: `api.listener.requestOldMessages(ThreadType.Group, lastMsgId)`
(nhận qua event `old_messages`), hoặc dùng `api.getGroupChatHistory(...)`. Lưu `lastExternalId`
(giống `AutoConversionRule.lastExternalId` đã có).

## 6. Health check
`testConnection`: gọi `api.fetchAccountInfo()` → `healthy` nếu trả info; lỗi auth → `failed`
+ set `PlatformSession.status="login_required"`. `api.getOwnId()` để lấy uid hiện tại.

## Done checklist
- [ ] `"zalo-personal"` thêm vào shared `platforms`
- [ ] QR login + lưu/khôi phục credentials qua Session Manager
- [ ] listener group → CrawlResult (dedup @@unique chạy)
- [ ] sendMessage tới group đích → PublishAttempt
- [ ] testConnection + auto relogin khi rớt
- [ ] random delay khi gửi
