import type { BrowserContext } from "playwright";
import { chromium } from "playwright";
import { ensureProfileDir, type ProfileRef } from "./profile-store.js";

export type LaunchMode = "headful" | "headless";
export type BrowserChannel = "chrome" | "msedge" | "chromium";

export type LaunchProfileOptions = {
  mode: LaunchMode;
  channel?: BrowserChannel;
  storageRoot?: string;
  args?: string[];
};

/**
 * Mở Playwright persistent context cho 1 account profile.
 * Cùng userDataDir nên giữ cookie/storage giữa các lần.
 * KHÔNG được mở 2 context cùng lúc với cùng profile.
 */
export async function launchProfile(ref: ProfileRef, options: LaunchProfileOptions): Promise<BrowserContext> {
  const userDataDir = ensureProfileDir(ref, options.storageRoot);
  const headless = options.mode === "headless";
  const channel = options.channel ?? "chrome";

  return chromium.launchPersistentContext(userDataDir, {
    headless,
    channel: channel === "chromium" ? undefined : channel,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      ...(options.args ?? [])
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    viewport: headless ? { width: 1280, height: 800 } : null
  });
}

/** Thử đăng nhập bằng cách điều hướng đến trang đích và kiểm tra trạng thái auth. */
export async function testLoginPage(
  context: BrowserContext,
  loginCheckUrl: string,
  isLoggedInSelector: string,
  timeoutMs = 5_000
): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto(loginCheckUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForSelector(isLoggedInSelector, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  } finally {
    await page.close().catch(() => undefined);
  }
}
