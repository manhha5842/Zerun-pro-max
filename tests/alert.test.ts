import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyConvertError, resetAlertThrottle, sendAlert } from "../packages/worker-core/src/notify/alert.js";

type FakePrisma = {
  systemSetting: { findUnique: (args: unknown) => Promise<{ value: unknown } | null> };
};

function prismaWith(value: unknown): FakePrisma {
  return { systemSetting: { findUnique: async () => (value === null ? null : { value }) } };
}

const enabled = { enabled: true, botToken: "T", chatId: "C" };

beforeEach(() => {
  resetAlertThrottle();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyConvertError", () => {
  it("maps login/unauthorized → login_required", () => {
    expect(classifyConvertError("HTTP 401 unauthorized")).toBe("login_required");
    expect(classifyConvertError("cần đăng nhập lại")).toBe("login_required");
  });
  it("maps captcha/empty → captcha", () => {
    expect(classifyConvertError("NO_DATA, batchCustomLink rỗng")).toBe("captcha");
    expect(classifyConvertError("captcha detected")).toBe("captcha");
  });
  it("falls back to convert_fail", () => {
    expect(classifyConvertError("timeout")).toBe("convert_fail");
  });
});

describe("sendAlert", () => {
  it("does not send when telegram_notify disabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await sendAlert(prismaWith({ enabled: false }) as never, { category: "publish_fail", detail: "x" });
    expect(res).toEqual({ sent: false, reason: "disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends and throttles duplicate within window", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    const first = await sendAlert(prismaWith(enabled) as never, { category: "login_required", platform: "telegram", account: "a1", detail: "401" });
    expect(first.sent).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await sendAlert(prismaWith(enabled) as never, { category: "login_required", platform: "telegram", account: "a1", detail: "401" });
    expect(second).toEqual({ sent: false, reason: "throttled" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("different keys are not throttled together", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    const a = await sendAlert(prismaWith(enabled) as never, { category: "login_required", platform: "telegram", account: "a1" });
    const b = await sendAlert(prismaWith(enabled) as never, { category: "login_required", platform: "telegram", account: "a2" });
    expect(a.sent).toBe(true);
    expect(b.sent).toBe(true);
  });

  it("reports send_failed when telegram returns non-OK and allows retry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const res = await sendAlert(prismaWith(enabled) as never, { category: "publish_fail", account: "x" });
    expect(res).toEqual({ sent: false, reason: "send_failed" });
    // not throttled because previous send failed
    const retry = await sendAlert(prismaWith(enabled) as never, { category: "publish_fail", account: "x" });
    expect(retry.reason).toBe("send_failed");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
