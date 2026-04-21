import { mkdirSync } from "node:fs";
import path from "node:path";
import { AdapterAuthError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readOptionalString, readString } from "../utils/credentials.js";

export class ZaloWebAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "zalo-web";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const context = await this.openContext(account);
    try {
      const page = await context.newPage();
      await page.goto("https://chat.zalo.me/", { waitUntil: "domcontentloaded", timeout: 30_000 });
      const state = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        return {
          hasLoginWall: bodyText.includes("đăng nhập") || bodyText.includes("login") || !!document.querySelector('input[type="tel"], input[type="password"]'),
          url: window.location.href
        };
      });
      if (state.hasLoginWall) return { status: "failed", message: "Zalo Web chưa đăng nhập" };
      return { status: "healthy", message: "Zalo Web session hợp lệ", metadata: { url: state.url } };
    } catch (error) {
      throw normalizeZaloWebError(error);
    } finally {
      await context.close();
    }
  }

  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const context = await this.openContext(input.account);
    const targetUrl = readOptionalString(input.account.credentials, "targetUrl");
    try {
      const page = await context.newPage();
      await page.goto(targetUrl || "https://chat.zalo.me/", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(2_000);
      const items = await page.evaluate((limit: number) => {
        const nodes = Array.from(document.querySelectorAll('[data-id], .message-item, .msg-item')).slice(-limit);
        return nodes.map((node: any, index) => ({
          externalId: String(node?.getAttribute?.('data-id') || `${Date.now()}-${index}`),
          text: (node?.innerText || '').trim()
        }));
      }, input.limit ?? 20);

      return {
        items: items
          .filter((item: any) => item.text)
          .map((item: any) => ({
            platform: this.platform,
            sourceId: input.account.id,
            externalId: item.externalId,
            text: item.text,
            media: [],
            metadata: {}
          }))
      };
    } catch (error) {
      throw normalizeZaloWebError(error);
    } finally {
      await context.close();
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    // TODO: not yet implemented - Zalo Web publish automation is scaffold only; needs runtime validation before production use
    const context = await this.openContext(input.account);
    const targetUrl = readOptionalString(input.account.credentials, "targetUrl");
    const targetName = readOptionalString(input.account.credentials, "targetName") ?? input.account.handle ?? undefined;
    const mediaPaths = input.media.map((m) => m.localPath ?? "").filter(Boolean);

    try {
      const page = await context.newPage();
      await page.goto(targetUrl || "https://chat.zalo.me/", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(2_000);

      const loginWall = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        return bodyText.includes("đăng nhập") || bodyText.includes("login") || !!document.querySelector('input[type="tel"], input[type="password"]');
      });
      if (loginWall) throw new AdapterAuthError("Zalo Web chưa đăng nhập");

      if (!targetUrl && targetName) {
        const searchBox = page.locator('input[placeholder*="Tìm"], input[placeholder*="Search"], input[type="search"]').first();
        await searchBox.click({ timeout: 10_000 });
        await searchBox.fill(targetName);
        await page.waitForTimeout(1_500);
        await page.locator(`text=${targetName}`).first().click({ timeout: 10_000 });
      }

      const inputBox = page.locator('div[contenteditable="true"], textarea').last();
      await inputBox.click({ timeout: 10_000 });
      await inputBox.fill(input.text);
      await page.waitForTimeout(300);

      if (mediaPaths.length > 0) {
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count()) {
          await fileInput.setInputFiles(mediaPaths);
          await page.waitForTimeout(2_000);
        }
      }

      await page.keyboard.press("Enter");
      await page.waitForTimeout(1_500);
      return { url: page.url(), metadata: { platform: this.platform } };
    } catch (error) {
      await captureScreenshot(context, "storage/screenshots", `zalo-web-error-${Date.now()}`).catch(() => undefined);
      throw normalizeZaloWebError(error);
    } finally {
      await context.close();
    }
  }

  private async openContext(account: AdapterAccount): Promise<any> {
    const sessionDir = readString(account.credentials, "sessionDir", `storage/sessions/zalo/${account.id}`);
    const { chromium } = await import("playwright");
    return chromium.launchPersistentContext(sessionDir, {
      headless: (account.config as Record<string, unknown>)?.headless === true,
      viewport: { width: 1366, height: 900 },
      args: ["--no-sandbox"]
    });
  }
}

async function captureScreenshot(context: any, dir: string, name: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.png`);
  const pages = context.pages();
  if (pages.length > 0) {
    await pages[0].screenshot({ path: filePath, fullPage: false });
  }
  return filePath;
}

function normalizeZaloWebError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/login|đăng nhập|password|session/i.test(message)) return new AdapterAuthError(message);
  if (/timeout|network|ECONN|Target closed/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
