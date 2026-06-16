import { describe, expect, it, vi } from "vitest";
import { AdapterAuthError, RetryableNetworkError, retryAfterMs, withRetry } from "../packages/shared/src/index.js";

const noSleep = async () => {};

describe("retryAfterMs", () => {
  it("reads .seconds (GramJS FloodWaitError)", () => {
    expect(retryAfterMs({ seconds: 42 })).toBe(42_000);
  });
  it("parses FLOOD_WAIT_X message", () => {
    expect(retryAfterMs(new Error("RPCError: FLOOD_WAIT_30"))).toBe(30_000);
  });
  it("parses 'wait of N seconds' message", () => {
    expect(retryAfterMs(new Error("A wait of 12 seconds is required"))).toBe(12_000);
  });
  it("returns undefined when no hint", () => {
    expect(retryAfterMs(new Error("boom"))).toBeUndefined();
  });
});

describe("withRetry", () => {
  it("returns on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RetryableNetworkError("net"))
      .mockResolvedValue("done");
    const result = await withRetry(fn, { sleep: noSleep, retries: 3 });
    expect(result).toBe("done");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry permanent errors (auth)", async () => {
    const fn = vi.fn().mockRejectedValue(new AdapterAuthError("login"));
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toBeInstanceOf(AdapterAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new RetryableNetworkError("net"));
    await expect(withRetry(fn, { sleep: noSleep, retries: 2 })).rejects.toBeInstanceOf(RetryableNetworkError);
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("honors FLOOD_WAIT delay via sleep arg", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("FLOOD_WAIT_5"))
      .mockResolvedValue("ok");
    await withRetry(fn, { sleep, retries: 2 });
    expect(sleeps[0]).toBe(5_000 + 1_000); // suggested + 1s buffer
  });
});
