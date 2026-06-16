# Tutorial — Mã hoá credentials / session (M2)

> Hiện `SourceAccount.credentials`, `TargetAccount.credentials`, `PlatformSession.data` lưu
> **plaintext JSON**. Chứa StringSession Telegram, cookie Zalo/Shopee, API key → phải mã hoá.

## 1. Sơ đồ
- **Master key** trong `.env` (`ZERUN_MASTER_KEY`, 32 bytes base64). KHÔNG commit, backup riêng.
- Mã hoá **field-level** bằng AES-256-GCM: mỗi giá trị nhạy cảm → `{iv, tag, data}` base64.
- Giải mã chỉ trong worker/api khi cần dùng; DB chỉ giữ ciphertext.

## 2. Helper (đặt ở `packages/shared/src/crypto.ts`)
```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY = Buffer.from(process.env.ZERUN_MASTER_KEY ?? "", "base64"); // 32 bytes

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(".");
}
export function decryptSecret(token: string): string {
  const [, ivb, tagb, datab] = token.split(".");
  const d = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivb, "base64"));
  d.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([d.update(Buffer.from(datab, "base64")), d.final()]).toString("utf8");
}
export const isEncrypted = (v: unknown) => typeof v === "string" && v.startsWith("v1.");
```

## 3. Áp dụng
- Tạo lớp truy cập credentials chung (vd `readCredentials(account)`) — tự `decryptSecret` các field
  đã mã hoá; ghi thì `encryptSecret`. Đừng rải encrypt/decrypt khắp nơi.
- Mã hoá đúng các field nhạy cảm: Telegram `session`, Zalo `cookie/imei`, Shopee `cookiePath` nội dung,
  mọi `apiKey/appSecret/accessToken`.
- `PlatformSession.data` → mã hoá cả object (stringify rồi encrypt).

## 4. Migration dữ liệu cũ
Script một lần: đọc tất cả record, field nào chưa `isEncrypted` → encrypt → ghi lại. Idempotent
(chạy lại không hỏng). Đặt ở `packages/db/src/migrate-encrypt.ts`, chạy bằng `tsx`.

## 5. Mất key = mất session
- Backup `ZERUN_MASTER_KEY` ở nơi an toàn (password manager). Mất key → phải login lại tất cả acc.
- Cân nhắc rotate: hỗ trợ prefix version (`v1.`) để sau đổi `v2.` mà vẫn đọc được data cũ.

## Done checklist
- [ ] `crypto.ts` encrypt/decrypt AES-256-GCM + isEncrypted
- [ ] lớp readCredentials/writeCredentials dùng chung
- [ ] mã hoá Telegram/Zalo/Shopee/API keys + PlatformSession.data
- [ ] migration script idempotent cho data cũ
- [ ] `.env.example` có ZERUN_MASTER_KEY (ghi chú backup)
