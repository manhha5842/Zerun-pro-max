import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateMasterKey,
  isEncrypted,
  readCredentials,
  readSessionData,
  resetCryptoKeyCache,
  writeCredentials,
  writeSessionData
} from "../packages/shared/src/index.js";

const prevKey = process.env.ZERUN_MASTER_KEY;

beforeEach(() => {
  process.env.ZERUN_MASTER_KEY = generateMasterKey();
  resetCryptoKeyCache();
});

afterEach(() => {
  if (prevKey === undefined) delete process.env.ZERUN_MASTER_KEY;
  else process.env.ZERUN_MASTER_KEY = prevKey;
  resetCryptoKeyCache();
});

describe("encryptSecret/decryptSecret", () => {
  it("round-trips a string", () => {
    const plain = "telegram-string-session-abc123";
    const token = encryptSecret(plain);
    expect(token).not.toBe(plain);
    expect(isEncrypted(token)).toBe(true);
    expect(decryptSecret(token)).toBe(plain);
  });

  it("is idempotent: encrypting a token returns it unchanged", () => {
    const token = encryptSecret("secret");
    expect(encryptSecret(token)).toBe(token);
  });

  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("passes plaintext through decrypt unchanged", () => {
    expect(decryptSecret("not-encrypted")).toBe("not-encrypted");
  });

  it("no-ops when key is missing", () => {
    delete process.env.ZERUN_MASTER_KEY;
    resetCryptoKeyCache();
    expect(encryptSecret("plain")).toBe("plain");
    expect(isEncrypted(encryptSecret("plain"))).toBe(false);
  });
});

describe("writeCredentials/readCredentials", () => {
  it("encrypts only sensitive fields and round-trips", () => {
    const creds = { apiKey: "k-123", appSecret: "s-456", baseUrl: "https://x", model: "auto" };
    const written = writeCredentials(creds) as typeof creds;
    expect(isEncrypted(written.apiKey)).toBe(true);
    expect(isEncrypted(written.appSecret)).toBe(true);
    expect(written.baseUrl).toBe("https://x");
    expect(written.model).toBe("auto");
    expect(readCredentials(written)).toEqual(creds);
  });

  it("encrypts nested sensitive fields", () => {
    const creds = { telegram: { session: "abc", phone: "+84" } };
    const written = writeCredentials(creds) as { telegram: { session: string; phone: string } };
    expect(isEncrypted(written.telegram.session)).toBe(true);
    expect(written.telegram.phone).toBe("+84");
    expect(readCredentials(written)).toEqual(creds);
  });

  it("is idempotent on already-encrypted credentials", () => {
    const written = writeCredentials({ token: "t" });
    expect(writeCredentials(written)).toEqual(written);
  });
});

describe("session data whole-object encryption", () => {
  it("wraps and round-trips", () => {
    const data = { cookie: "c", imei: "i", threadId: "123" };
    const wrapped = writeSessionData(data);
    expect(isEncrypted(wrapped._enc as string)).toBe(true);
    expect(readSessionData(wrapped)).toEqual(data);
  });

  it("does not double-wrap", () => {
    const wrapped = writeSessionData({ a: 1 });
    expect(writeSessionData(wrapped)).toEqual(wrapped);
  });
});
