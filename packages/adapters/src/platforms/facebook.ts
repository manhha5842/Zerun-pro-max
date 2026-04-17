import { mkdirSync } from "node:fs";
import path from "node:path";
import { AdapterAuthError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readString } from "../utils/credentials.js";

export type FbPostType = "feed" | "story" | "reel";

export type FbPublishInput = {
  account: AdapterAccount;
  type: FbPostType;
  caption?: string;
  mediaPaths: string[];
  screenshotDir?: string;
};

export type FbPublishResult = {
  postUrl?: string;
  metadata?: Record<string, unknown>;
};

export type FbCommentInput = {
  account: AdapterAccount;
  postUrl: string;
  text: string;
  screenshotDir?: string;
};

export class FacebookAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "facebook";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const context = await this.openContext(account);
    try {
      const page = await context.newPage();
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
      const loginVisible = await page.locator("input[name='email']").first().isVisible().catch(() => false);
      return loginVisible
        ? { status: "checkpoint", message: "Facebook cần đăng nhập hoặc checkpoint trong browser session" }
        : { status: "healthy", message: "Facebook session có vẻ hợp lệ" };
    } finally {
      await context.close();
    }
  }

  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const url = readString(input.account.credentials, "url", input.account.handle ?? undefined);
    const context = await this.openContext(input.account);

    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      const body = (await page.locator("body").innerText()) as string;
      const lines = body
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 30)
        .slice(0, input.limit ?? 10);

      return {
        items: lines.map((line: string, index: number) => ({
          platform: this.platform,
          sourceId: input.account.id,
          externalId: `${Date.now()}-${index}`,
          author: input.account.handle ?? undefined,
          text: line,
          media: [],
          originalUrl: url,
          metadata: { crawler: "playwright" }
        }))
      };
    } catch (error) {
      throw normalizeFacebookError(error);
    } finally {
      await context.close();
    }
  }

  // Generic publish (used by existing routing/publish pipeline)
  async publish(input: PublishInput): Promise<PublishResult> {
    const result = await this.publishFb({
      account: input.account,
      type: "feed",
      caption: input.text,
      mediaPaths: input.media.map((m) => m.localPath ?? m.url ?? "").filter(Boolean)
    });
    return { url: result.postUrl, metadata: result.metadata };
  }

  // ── Facebook-specific publish ────────────────────────────────────────────────

  async publishFb(input: FbPublishInput): Promise<FbPublishResult> {
    const context = await this.openContext(input.account);
    const screenshotDir = input.screenshotDir ?? "storage/screenshots";

    try {
      const page = await context.newPage();

      switch (input.type) {
        case "feed":
          return await this._publishFeed(page, input.caption ?? "", input.mediaPaths);
        case "story":
          return await this._publishStory(page, input.mediaPaths[0] ?? "");
        case "reel":
          return await this._publishReel(page, input.caption ?? "", input.mediaPaths[0] ?? "");
        default:
          throw new Error(`Unknown post type: ${input.type}`);
      }
    } catch (error) {
      await this._screenshot(context, screenshotDir, `fb-error-${Date.now()}`).catch(() => undefined);
      throw normalizeFacebookError(error);
    } finally {
      await context.close();
    }
  }

  async addComment(input: FbCommentInput): Promise<void> {
    const context = await this.openContext(input.account);
    const screenshotDir = input.screenshotDir ?? "storage/screenshots";

    try {
      const page = await context.newPage();
      await page.goto(input.postUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(2_000);

      // Open comment box
      const commentBox = page.locator('[aria-label*="comment" i], [aria-label*="bình luận" i], [data-lexical-editor]').first();
      await commentBox.click({ timeout: 15_000 });
      await page.waitForTimeout(500);

      await commentBox.fill(input.text);
      await page.waitForTimeout(500);

      // Submit (Enter key or button)
      await commentBox.press("Enter");
      await page.waitForTimeout(2_000);
    } catch (error) {
      await this._screenshot(context, screenshotDir, `fb-comment-error-${Date.now()}`).catch(() => undefined);
      throw normalizeFacebookError(error);
    } finally {
      await context.close();
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _publishFeed(page: any, caption: string, mediaPaths: string[]): Promise<FbPublishResult> {
    const targetUrl = readString(page._target?.url?.() ?? {}, "targetUrl", "https://www.facebook.com/");
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(2_000);

    // Open post composer
    await page.getByText(/What's on your mind|Bạn đang nghĩ gì/i).first().click({ timeout: 20_000 });
    await page.waitForTimeout(1_000);

    // Upload media if any
    if (mediaPaths.length > 0) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15_000 }),
        page.locator('[aria-label*="Photo" i], [aria-label*="Ảnh" i], [aria-label*="video" i]').first().click()
      ]);
      await fileChooser.setFiles(mediaPaths);
      await page.waitForTimeout(3_000);
    }

    // Fill caption
    if (caption) {
      const textbox = page.getByRole("textbox").first();
      await textbox.click();
      await textbox.fill(caption);
      await page.waitForTimeout(500);
    }

    // Submit
    await page.getByText(/^Post$|^Đăng$/i).last().click({ timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    return { postUrl: page.url(), metadata: { platform: "facebook", type: "feed" } };
  }

  private async _publishStory(page: any, mediaPath: string): Promise<FbPublishResult> {
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(2_000);

    // Click "Create Story" / "Tạo tin"
    await page
      .locator('[aria-label*="Create story" i], [aria-label*="Tạo tin" i], [aria-label*="Add to story" i], [aria-label*="Thêm vào tin" i]')
      .first()
      .click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);

    // Upload image
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15_000 }),
      page.locator('[aria-label*="Photo" i], [aria-label*="Ảnh" i], input[type="file"]').first().click()
    ]);
    await fileChooser.setFiles([mediaPath]);
    await page.waitForTimeout(3_000);

    // Publish story
    await page
      .locator('[aria-label*="Share to story" i], [aria-label*="Chia sẻ lên tin" i]')
      .first()
      .click({ timeout: 20_000 })
      .catch(async () => {
        await page.getByText(/Share to story|Chia sẻ lên tin/i).first().click({ timeout: 15_000 });
      });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    return { postUrl: page.url(), metadata: { platform: "facebook", type: "story" } };
  }

  private async _publishReel(page: any, caption: string, videoPath: string): Promise<FbPublishResult> {
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(2_000);

    // Open post composer and select Reel type
    await page.getByText(/What's on your mind|Bạn đang nghĩ gì/i).first().click({ timeout: 20_000 });
    await page.waitForTimeout(1_000);

    // Try to switch to Reel tab in composer
    const reelTab = page.locator('[role="tab"][aria-label*="Reel" i], [data-testid*="reel" i]').first();
    const reelTabVisible = await reelTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (reelTabVisible) {
      await reelTab.click();
      await page.waitForTimeout(1_000);
    }

    // Upload video
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15_000 }),
      page.locator('[aria-label*="Reel" i], [aria-label*="video" i], input[type="file"]').first().click()
    ]);
    await fileChooser.setFiles([videoPath]);
    await page.waitForTimeout(5_000); // video upload takes longer

    // Fill caption
    if (caption) {
      const textbox = page.getByRole("textbox").first();
      await textbox.click();
      await textbox.fill(caption);
      await page.waitForTimeout(500);
    }

    // Submit
    await page.getByText(/^Post$|^Đăng$|^Publish$|^Xuất bản$/i).last().click({ timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 60_000 }); // video processing

    return { postUrl: page.url(), metadata: { platform: "facebook", type: "reel" } };
  }

  private async _screenshot(context: any, dir: string, name: string): Promise<string> {
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${name}.png`);
    const pages = context.pages();
    if (pages.length > 0) {
      await pages[0].screenshot({ path: filePath, fullPage: false });
    }
    return filePath;
  }

  private async openContext(account: AdapterAccount): Promise<any> {
    const sessionDir = readString(account.credentials, "sessionDir", `storage/sessions/facebook/${account.id}`);
    const { chromium } = await import("playwright");
    return chromium.launchPersistentContext(sessionDir, {
      headless: account.config.headless !== false,
      viewport: { width: 1366, height: 900 }
    });
  }
}

function normalizeFacebookError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/login|checkpoint|challenge|password/i.test(message)) return new AdapterAuthError(message);
  if (/timeout|net::|ECONN|Target closed/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
