import { decryptSecret, encryptSecret, isEncrypted } from "./crypto.js";

/**
 * Lớp truy cập credentials/session dùng chung — encrypt khi ghi, decrypt khi đọc.
 * Đừng rải encrypt/decrypt khắp nơi; mọi adapter/processor đi qua đây.
 *
 * - `writeCredentials` mã hoá các field nhạy cảm (theo tên, case-insensitive),
 *   bỏ qua field đã mã hoá → idempotent, an toàn khi merge object cũ.
 * - `readCredentials` giải mã mọi token `v1.` gặp được; plaintext đi qua nguyên trạng.
 * - `PlatformSession.data` mã hoá cả object (wrap `{ _enc }`).
 */

/** Tên field cần mã hoá (so khớp không phân biệt hoa/thường). */
const SENSITIVE_FIELDS = new Set([
  "session",
  "stringsession",
  "cookie",
  "cookies",
  "imei",
  "password",
  "secret",
  "token",
  "apikey",
  "apisecret",
  "appsecret",
  "accesstoken",
  "refreshtoken",
  "usertoken",
  "authtoken",
  "privatekey"
]);

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_FIELDS.has(k)) return true;
  // bắt biến thể có hậu tố/ tiền tố: appSecret, refresh_token, x_api_key...
  return /(secret|token|password|apikey|api_key|cookie|session|imei)/.test(k);
}

type JsonRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Mã hoá field nhạy cảm trong credentials trước khi lưu DB. */
export function writeCredentials<T>(credentials: T): T {
  return transformFields(credentials, (key, value) =>
    isSensitiveKey(key) && typeof value === "string" && value.length > 0 ? encryptSecret(value) : value
  ) as T;
}

/** Giải mã credentials đọc từ DB để adapter/processor dùng. */
export function readCredentials<T>(credentials: T): T {
  return transformFields(credentials, (_key, value) =>
    isEncrypted(value) ? decryptSecret(value) : value
  ) as T;
}

function transformFields(value: unknown, fn: (key: string, value: unknown) => unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => transformFields(item, fn));
  if (isPlainObject(value)) {
    const out: JsonRecord = {};
    for (const [key, raw] of Object.entries(value)) {
      const mapped = fn(key, raw);
      // chỉ đệ quy khi field không bị fn thay thế (giữ nguyên ciphertext)
      out[key] = mapped === raw && (Array.isArray(raw) || isPlainObject(raw)) ? transformFields(raw, fn) : mapped;
    }
    return out;
  }
  return value;
}

// ── PlatformSession.data: mã hoá cả object ────────────────────────────────────

const ENC_WRAPPER_KEY = "_enc";

/** Mã hoá toàn bộ session data thành `{ _enc: token }`. */
export function writeSessionData(data: unknown): JsonRecord {
  if (data == null) return {};
  if (isPlainObject(data) && typeof data[ENC_WRAPPER_KEY] === "string" && isEncrypted(data[ENC_WRAPPER_KEY])) {
    return data; // đã mã hoá
  }
  const token = encryptSecret(JSON.stringify(data));
  // không có key → encryptSecret trả plaintext; vẫn wrap để format đồng nhất, nhưng
  // chỉ wrap khi thực sự mã hoá được (token là ciphertext), tránh lộ format vô ích.
  return isEncrypted(token) ? { [ENC_WRAPPER_KEY]: token } : (isPlainObject(data) ? data : { value: data });
}

/** Giải mã session data đã wrap; object thường đi qua nguyên trạng. */
export function readSessionData(data: unknown): JsonRecord {
  if (isPlainObject(data) && typeof data[ENC_WRAPPER_KEY] === "string" && isEncrypted(data[ENC_WRAPPER_KEY])) {
    try {
      const parsed = JSON.parse(decryptSecret(data[ENC_WRAPPER_KEY] as string));
      return isPlainObject(parsed) ? parsed : { value: parsed };
    } catch {
      return {};
    }
  }
  return isPlainObject(data) ? data : {};
}
