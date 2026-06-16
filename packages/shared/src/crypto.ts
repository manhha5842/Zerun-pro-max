import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Field-level mã hoá AES-256-GCM cho credentials/session nhạy cảm.
 *
 * Token format: `v1.<iv>.<tag>.<data>` (mỗi phần base64).
 * - Master key đọc từ `ZERUN_MASTER_KEY` (base64 32 bytes; nếu không đúng 32 bytes
 *   thì derive bằng SHA-256 để vẫn dùng được passphrase tuỳ ý).
 * - Không có key → encrypt là no-op (trả plaintext) để dev chạy được; decrypt chỉ
 *   xử lý chuỗi đã `isEncrypted`, nên plaintext luôn đi qua an toàn.
 */

const VERSION = "v1";

let cachedKey: Buffer | null | undefined;

function loadKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.ZERUN_MASTER_KEY?.trim();
  if (!raw) {
    cachedKey = null;
    return cachedKey;
  }
  const decoded = Buffer.from(raw, "base64");
  // base64 hợp lệ và đúng 32 bytes → dùng trực tiếp; ngược lại derive SHA-256.
  cachedKey = decoded.length === 32 ? decoded : createHash("sha256").update(raw, "utf8").digest();
  return cachedKey;
}

/** Cho test/migration đổi key runtime. */
export function resetCryptoKeyCache(): void {
  cachedKey = undefined;
}

/** Có cấu hình master key hay không. */
export function hasMasterKey(): boolean {
  return loadKey() !== null;
}

/** Một giá trị đã được mã hoá (token `v1.`). */
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${VERSION}.`) && value.split(".").length === 4;
}

/** Mã hoá 1 chuỗi. Idempotent: chuỗi đã mã hoá hoặc thiếu key → trả nguyên trạng. */
export function encryptSecret(plain: string): string {
  if (isEncrypted(plain)) return plain;
  const key = loadKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(".");
}

/** Giải mã token. Nếu không phải token mã hoá → trả nguyên trạng (backward-compatible). */
export function decryptSecret(token: string): string {
  if (!isEncrypted(token)) return token;
  const key = loadKey();
  if (!key) throw new Error("ZERUN_MASTER_KEY chưa cấu hình — không giải mã được credentials.");
  const [, ivb, tagb, datab] = token.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivb, "base64"));
  decipher.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(datab, "base64")), decipher.final()]).toString("utf8");
}

/** Sinh master key mới (base64) — tiện cho CLI/docs. */
export function generateMasterKey(): string {
  return randomBytes(32).toString("base64");
}
