import { mkdirSync } from "node:fs";
import path from "node:path";
import { AdapterAuthError, AdapterCheckpointError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CommentInput, CommentResult, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readString } from "../utils/credentials.js";

export class ThreadsAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "threads";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const context = await this.openContext(account);
    try {
      const page = await context.newPage();
      await page.goto("https://www.threads.net/", { waitUntil: "domcontentloaded", timeout: 30_000 });

      const state = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        const checkpointPhrases = ["checkpoint", "suspended", "confirm your identity", "unusual login"];
        const authPhrases = ["log in", "sign in", "dang nhap"];
        return {
          hasCheckpoint: checkpointPhrases.some((p) => bodyText.includes(p)),
          hasLoginWall: authPhrases.some((p) => bodyText.includes(p)) || !!document.querySelector('input[name="username"]'),
          url: window.location.href
        };
      });

      if (state.hasCheckpoint) {
        return { status: "checkpoint", message: "Threads checkpoint or account suspension detected" };
      }
      if (state.hasLoginWall) {
        return { status: "failed", message: "Threads session expired or not authenticated" };
      }
      return { status: "healthy", message: "Threads session is valid" };
    } catch (error) {
      return { status: "degraded", message: normalizeThreadsError(error).message };
    } finally {
      await context.close();
    }
  }

  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const profileUrl = readString(input.account.credentials, "profileUrl", input.account.handle ? `https://www.threads.net/@${input.account.handle.replace(/^@/, "")}` : undefined);
    const context = await this.openContext(input.account);

    try {
      const page = await context.newPage();
      await page.goto(profileUrl, { waitUntil: "networkidle" });
      const scriptTexts = await page.locator("script").allTextContents();
      const text = (await page.locator("body").innerText()) as string;
      const lines = text
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 20)
        .slice(0, input.limit ?? 10);

      return {
        items: lines.map((line: string, index: number) => ({
          platform: this.platform,
          sourceId: input.account.id,
          externalId: `${Date.now()}-${index}`,
          author: input.account.handle ?? undefined,
          text: line,
          media: [],
          originalUrl: profileUrl,
          metadata: { scriptCount: scriptTexts.length }
        }))
      };
    } catch (error) {
      throw normalizeThreadsError(error);
    } finally {
      await context.close();
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const mediaPaths = input.media.map((m) => m.localPath ?? m.url ?? "").filter(Boolean);
    const context = await this.openContext(input.account);

    try {
      const page = await context.newPage();
      await page.goto("https://www.threads.net/", { waitUntil: "domcontentloaded", timeout: 40_000 });
      await dismissCookieDialog(page);

      const authState = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        return {
          hasLoginWall: !!document.querySelector('input[name="username"]') || bodyText.includes("log in") || bodyText.includes("dang nhap"),
          hasCheckpoint: bodyText.includes("checkpoint") || bodyText.includes("suspended")
        };
      });

      if (authState.hasCheckpoint) throw new AdapterCheckpointError("Threads checkpoint detected");
      if (authState.hasLoginWall) throw new AdapterAuthError("Threads session expired or not authenticated");

      await clickFirst(page, [
        '[aria-label*="New thread" i]',
        '[aria-label*="Create" i]',
        '[aria-label*="Compose" i]',
        '[aria-label*="new" i]',
        'text=/New thread|Start a thread|Chuỗi mới|Bắt đầu|Viết/i',
        'div[role="button"]:has([class*="pencil"])',
        'div[role="button"]:has([class*="compose"])',
        'a[href*="/intent/post"]',
        'a[href="/intent/post"]'
      ], { timeout: 15_000 });

      await page.waitForTimeout(1_000);

      const textbox = page.locator('[role="dialog"] [role="textbox"], [role="textbox"], [contenteditable="true"], textarea').first();
      await textbox.click({ timeout: 10_000 });
      await textbox.fill(input.text);
      await page.waitForTimeout(500);

      if (mediaPaths.length > 0) {
        const fileInput = page.locator('input[type="file"][accept*="image"], input[type="file"][accept*="video"], input[type="file"]');
        if (await fileInput.count() > 0) {
          await fileInput.first().setInputFiles(mediaPaths);
          await page.waitForTimeout(4_000);
        } else {
          const opened = await clickFirstVisible(page, [
            '[aria-label*="photo" i]',
            '[aria-label*="media" i]',
            '[aria-label*="image" i]',
            '[aria-label*="attach" i]',
            '[aria-label*="gallery" i]',
            '[aria-label*="camera" i]',
            'button:has([class*="photo"])',
            'button:has([class*="media"])',
            'div[role="button"]:has-text("Ảnh")'
          ], { timeout: 8_000 });

          if (opened) {
            const chooserInput = page.locator('input[type="file"]').first();
            if (await chooserInput.count().catch(() => 0)) {
              await chooserInput.setInputFiles(mediaPaths);
            } else {
              const [fileChooser] = await Promise.all([
                page.waitForEvent("filechooser", { timeout: 15_000 }),
                clickFirst(page, ['[aria-label*="Select" i]', 'button:has-text("Select")', 'text=/Select|Chọn/i'], { timeout: 15_000 })
              ]);
              await fileChooser.setFiles(mediaPaths);
            }
            await page.waitForTimeout(4_000);
          }
        }
      }

      let posted = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        posted = await clickFirstVisible(page, [
          'text=/^Post$|^Dang$/i',
          '[aria-label*="Post" i]',
          'div[role="button"]:has-text("Post")',
          'button:has-text("Post")',
          'button[type="submit"]'
        ], { timeout: 8_000 }).catch(() => false);
        if (posted) break;
        await page.waitForTimeout(1_000);
      }

      if (!posted) {
        throw new Error("Could not find the Post button for Threads publish.");
      }

      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(2_000);

      const successState = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        return {
          hasError: bodyText.includes("something went wrong") || bodyText.includes("try again"),
          url: window.location.href
        };
      });
      if (successState.hasError) throw new Error("Threads post may have failed");

      return { url: successState.url, metadata: { platform: this.platform, mediaCount: mediaPaths.length } };
    } catch (error) {
      await captureScreenshot(context, "storage/screenshots", `threads-error-${Date.now()}`).catch(() => undefined);
      throw normalizeThreadsError(error);
    } finally {
      await context.close();
    }
  }

  async comment(input: CommentInput): Promise<CommentResult> {
    const context = await this.openContext(input.account);
    try {
      const page = await context.newPage();
      const mediaPaths = input.media?.map((m) => m.localPath ?? m.url ?? "").filter(Boolean) ?? [];
      await this.publishComment(page, input.postUrl, input.text, mediaPaths);
      return { url: input.postUrl, metadata: { platform: this.platform } };
    } catch (error) {
      await captureScreenshot(context, "storage/screenshots", `threads-comment-error-${Date.now()}`).catch(() => undefined);
      throw normalizeThreadsError(error);
    } finally {
      await context.close();
    }
  }

  async publishComment(page: any, postUrl: string, text: string, mediaPaths: string[] = []): Promise<void> {
    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await dismissCookieDialog(page);
    await page.waitForTimeout(1_500);

    await clickFirst(page, [
      '[aria-label*="Reply" i]',
      'text=/^Reply$/i',
      'button:has-text("Reply")',
      '[data-testid*="reply"]'
    ], { timeout: 15_000 });

    const textbox = page.locator('[role="dialog"] [role="textbox"], [role="textbox"], [contenteditable="true"]').first();
    await textbox.fill(text);
    await page.waitForTimeout(300);

    if (mediaPaths.length > 0) {
      const fileInput = page.locator('input[type="file"][accept*="image"], input[type="file"][accept*="video"], input[type="file"]');
      if (await fileInput.count() > 0) {
        await fileInput.first().setInputFiles(mediaPaths);
      } else {
        const opened = await clickFirstVisible(page, [
          '[aria-label*="photo" i]',
          '[aria-label*="media" i]',
          '[aria-label*="image" i]',
          '[aria-label*="attach" i]',
          'button:has([class*="photo"])',
          'button:has([class*="media"])'
        ], { timeout: 8_000 });
        if (!opened) throw new Error("Threads reply media input was not found.");
        const chooserInput = page.locator('input[type="file"]').first();
        if (await chooserInput.count()) await chooserInput.setInputFiles(mediaPaths);
      }
      await page.waitForTimeout(3_000);
    }

    await clickFirst(page, [
      'text=/^Post$|^Dang$/i',
      '[aria-label*="Post" i]'
    ], { timeout: 10_000 });
  }

  private async openContext(account: AdapterAccount): Promise<any> {
    const sessionDir = readString(account.credentials, "sessionDir", `storage/sessions/threads/${account.id}`);
    const { chromium } = await import("playwright");
    return chromium.launchPersistentContext(sessionDir, {
      headless: (account.config as Record<string, unknown>)?.headless === true,
      viewport: { width: 1280, height: 900 },
      args: ["--no-sandbox"]
    });
  }
}

async function dismissCookieDialog(page: any): Promise<void> {
  await page
    .getByRole("button", { name: /allow all cookies|accept all|accept cookies|only allow essential cookies/i })
    .click({ timeout: 3_000 })
    .catch(() => undefined);

  await clickFirstVisible(page, [
    'text=/Allow all cookies|Accept all|Only allow essential cookies/i',
    '[aria-label*="cookies" i]'
  ], { timeout: 2_000 }).catch(() => false);
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

async function clickFirst(page: any, selectors: string[], options: { timeout?: number } = {}): Promise<void> {
  let lastError: unknown;
  for (const selector of selectors) {
    try {
      await page.locator(selector).first().click({ timeout: options.timeout ?? 8_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not click any selector: ${selectors.join(" | ")}`);
}

async function clickFirstVisible(page: any, selectors: string[], options: { timeout?: number } = {}): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector).first();
      const visible = await loc.isVisible({ timeout: options.timeout ?? 3_000 }).catch(() => false);
      if (visible) {
        await loc.click({ timeout: options.timeout ?? 3_000 });
        return true;
      }
    } catch {
      // try next
    }
  }
  return false;
}

function normalizeThreadsError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/checkpoint|suspended|confirm your identity/i.test(message)) return new AdapterCheckpointError(message);
  if (/login|password|session expired|not authenticated/i.test(message)) return new AdapterAuthError(message);
  if (/timeout|net::|ECONN|Target closed/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
