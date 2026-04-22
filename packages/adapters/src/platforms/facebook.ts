import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { AdapterAuthError, AdapterCheckpointError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CommentInput, CommentResult, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readString } from "../utils/credentials.js";

export type FbPostType = "feed" | "story" | "reel";

export type FbPublishInput = {
  account: AdapterAccount;
  type: FbPostType;
  caption?: string;
  mediaPaths: string[];
  screenshotDir?: string;
  screenshotName?: string;
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
  screenshotName?: string;
};

const AUTH_COOKIE_NAMES = ["c_user", "xs"] as const;
const FACEBOOK_HOME_URL = "https://www.facebook.com/";

export class FacebookAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "facebook";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const { browser, context } = await this.openContext(account);
    try {
      const page = await context.newPage();
      await page.goto(FACEBOOK_HOME_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await dismissCookieDialog(page);

      const authState = await this.inspectAuth(page, context);
      if (authState.kind === "ok") {
        return { status: "healthy", message: "Facebook session is valid", metadata: authState.metadata };
      }

      return {
        status: "checkpoint",
        message: authState.message,
        metadata: authState.metadata
      };
    } catch (error) {
      const classified = normalizeFacebookError(error);
      return { status: "degraded", message: classified.message };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const url = readString(input.account.credentials, "url", input.account.handle ?? undefined);
    const { browser, context } = await this.openContext(input.account);

    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 40_000 });
      const body = await page.locator("body").innerText();
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
      await browser.close();
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const result = await this.publishFb({
      account: input.account,
      type: "feed",
      caption: input.text,
      mediaPaths: input.media.map((m) => m.localPath ?? m.url ?? "").filter(Boolean)
    });
    return { url: result.postUrl, metadata: result.metadata };
  }

  async publishFb(input: FbPublishInput): Promise<FbPublishResult> {
    const { browser, context } = await this.openContext(input.account);
    const screenshotDir = input.screenshotDir ?? "storage/screenshots";
    const screenshotName = input.screenshotName ?? `fb-error-${Date.now()}`;

    try {
      const page = await context.newPage();
      await page.goto(FACEBOOK_HOME_URL, { waitUntil: "domcontentloaded", timeout: 40_000 });
      await dismissCookieDialog(page);
      await this.ensureAuthenticated(page, context);

      switch (input.type) {
        case "feed":
          return await this.publishFeed(page, input.caption ?? "", input.mediaPaths);
        case "story":
          return await this.publishStory(page, input.mediaPaths[0] ?? "");
        case "reel":
          return await this.publishReel(page, input.caption ?? "", input.mediaPaths[0] ?? "");
      }
    } catch (error) {
      await this.captureScreenshot(context, screenshotDir, screenshotName).catch(() => undefined);
      throw normalizeFacebookError(error);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async addComment(input: FbCommentInput): Promise<void> {
    const { browser, context } = await this.openContext(input.account);
    const screenshotDir = input.screenshotDir ?? "storage/screenshots";
    const screenshotName = input.screenshotName ?? `fb-comment-error-${Date.now()}`;

    try {
      const page = await context.newPage();
      await page.goto(input.postUrl, { waitUntil: "domcontentloaded", timeout: 40_000 });
      await dismissCookieDialog(page);
      await this.ensureAuthenticated(page, context);
      await page.waitForTimeout(2_000);

      const commentBox = firstLocator(page, [
        '[aria-label*="comment" i]',
        '[aria-label*="bình luận" i]',
        '[data-lexical-editor="true"]',
        '[contenteditable="true"][role="textbox"]'
      ]);

      await commentBox.click({ timeout: 15_000 });
      await page.waitForTimeout(300);
      await commentBox.fill(input.text);
      await page.waitForTimeout(300);
      await commentBox.press("Enter");
      await page.waitForTimeout(2_000);
    } catch (error) {
      await this.captureScreenshot(context, screenshotDir, screenshotName).catch(() => undefined);
      throw normalizeFacebookError(error);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async comment(input: CommentInput): Promise<CommentResult> {
    await this.addComment({
      account: input.account,
      postUrl: input.postUrl,
      text: input.text,
      screenshotName: `fb-comment-${Date.now()}`
    });
    return { url: input.postUrl, metadata: { platform: this.platform } };
  }

  private async publishFeed(page: any, caption: string, mediaPaths: string[]): Promise<FbPublishResult> {
    await this.openComposer(page);
    await page.waitForTimeout(1_500);

    if (mediaPaths.length > 0) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15_000 }),
        firstLocator(page, [
          '[aria-label*="Photo/video" i]',
          '[aria-label*="Ảnh/video" i]',
          '[aria-label*="Photo" i]',
          '[aria-label*="video" i]'
        ]).click({ timeout: 15_000 })
      ]);
      await fileChooser.setFiles(mediaPaths);
      await page.waitForTimeout(3_000);
    }

    if (caption) {
      const textbox = firstLocator(page, [
        '[role="dialog"] [role="textbox"]',
        '[contenteditable="true"][role="textbox"]',
        '[data-lexical-editor="true"]'
      ]);
      await textbox.click({ timeout: 10_000 });
      await textbox.fill(caption);
      await page.waitForTimeout(500);
    }

    await this.submitPost(page);
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    return { postUrl: page.url(), metadata: { platform: "facebook", type: "feed" } };
  }

  private async publishStory(page: any, mediaPath: string): Promise<FbPublishResult> {
    if (!mediaPath) throw new Error("Story requires exactly one image");

    let onStoryPage = false;
    try {
      await page.goto("https://www.facebook.com/stories/create", { waitUntil: "domcontentloaded", timeout: 20_000 });
      await dismissCookieDialog(page);
      onStoryPage = page.url().includes("stories/create") || page.url().includes("stories");
    } catch {
      onStoryPage = false;
    }

    if (!onStoryPage) {
      await page.goto(FACEBOOK_HOME_URL, { waitUntil: "domcontentloaded", timeout: 40_000 });
      await dismissCookieDialog(page);

      const opened = await clickFirstVisible(page, [
        '[aria-label*="Create story" i]',
        '[aria-label*="Tạo tin" i]',
        '[aria-label*="Create a story" i]',
        '[aria-label*="Add to story" i]',
        '[aria-label*="Thêm vào tin" i]',
        'a[href*="stories/create"]',
        'text=/Create story|Tạo tin|Add to story|Thêm vào tin/i'
      ], { timeout: 20_000 });

      if (!opened) {
        throw new Error("Không tìm thấy nút tạo story trên Facebook.");
      }

      await page.waitForTimeout(2_000);
    }

    await clickFirstVisible(page, [
      'text=/^Photo$|^Ảnh$/i',
      '[aria-label*="Photo" i]',
      '[aria-label*="Ảnh" i]'
    ], { timeout: 5_000 }).catch(() => false);

    const storyInput = page.locator('input[type="file"][accept*="image"], input[type="file"]');
    if (await storyInput.count()) {
      await storyInput.first().setInputFiles([mediaPath]);
    } else {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15_000 }),
        clickFirst(page, [
          '[aria-label*="Photo" i]',
          '[aria-label*="Ảnh" i]',
          '[aria-label*="Upload" i]',
          'text=/Photo|Ảnh|Upload/i'
        ], { timeout: 15_000 })
      ]);
      await fileChooser.setFiles([mediaPath]);
    }

    await page.waitForTimeout(4_000);

    const shared = await clickFirstVisible(page, [
      '[aria-label*="Share to story" i]',
      '[aria-label*="Chia sẻ lên tin" i]',
      '[aria-label*="Share" i]',
      '[aria-label*="Chia sẻ" i]',
      'text=/Share to story|Chia sẻ lên tin|Share|Chia sẻ/i'
    ], { timeout: 20_000 });

    if (!shared) {
      throw new Error("Không tìm thấy nút chia sẻ story.");
    }

    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    return { postUrl: page.url(), metadata: { platform: "facebook", type: "story" } };
  }

  private async publishReel(page: any, caption: string, videoPath: string): Promise<FbPublishResult> {
    if (!videoPath) throw new Error("Reel requires exactly one video");

    let onReelPage = false;
    try {
      await page.goto("https://www.facebook.com/reels/create/", { waitUntil: "domcontentloaded", timeout: 20_000 });
      await dismissCookieDialog(page);
      onReelPage = page.url().includes("/reels/create");
    } catch {
      onReelPage = false;
    }

    if (!onReelPage) {
      await page.goto(FACEBOOK_HOME_URL, { waitUntil: "domcontentloaded", timeout: 40_000 });
      await dismissCookieDialog(page);

      const opened = await clickFirstVisible(page, [
        'div[role="button"]:has-text("Reel")',
        'div[role="button"]:has-text("Thước phim")',
        '[aria-label*="Reel" i]',
        'text=/Reel|Thước phim/i'
      ], { timeout: 15_000 });

      if (!opened) {
        await this.openComposer(page);
        await page.waitForTimeout(1_000);
        await clickFirstVisible(page, [
          '[role="tab"][aria-label*="Reel" i]',
          '[role="tab"][aria-label*="Video" i]',
          'text=/Reel|Video|Thước phim/i'
        ], { timeout: 8_000 });
      }

      await page.waitForTimeout(2_000);
    }

    const reelInput = page.locator('div[aria-label="Reels"][role="form"] input[type="file"], input[type="file"][accept*="video"], input[type="file"]');
    if (await reelInput.count()) {
      await reelInput.first().setInputFiles([videoPath]);
    } else {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15_000 }),
        clickFirst(page, [
          '[aria-label*="Upload" i]',
          '[aria-label*="Video" i]',
          '[aria-label*="Reel" i]',
          'text=/Upload|Video|Reel|Thước phim/i'
        ], { timeout: 15_000 })
      ]);
      await fileChooser.setFiles([videoPath]);
    }

    await page.waitForTimeout(5_000);

    await clickFirstVisible(page, [
      '[aria-label="Next"]',
      '[aria-label="Tiếp"]',
      'text=/^Next$|^Tiếp$/i'
    ], { timeout: 5_000 }).catch(() => false);
    await page.waitForTimeout(1_000);
    await clickFirstVisible(page, [
      '[aria-label="Next"]',
      '[aria-label="Tiếp"]',
      'text=/^Next$|^Tiếp$/i'
    ], { timeout: 5_000 }).catch(() => false);

    if (caption) {
      const textbox = firstLocator(page, [
        'div[role="dialog"] form[method="POST"] [contenteditable="true"]',
        'div[aria-label="Reels"][role="form"] [contenteditable="true"]',
        '[role="dialog"] [role="textbox"]',
        '[contenteditable="true"][role="textbox"]',
        '[data-lexical-editor="true"]'
      ]);
      await textbox.click({ timeout: 10_000 });
      await textbox.fill(caption);
      await page.waitForTimeout(500);
    }

    await this.submitPost(page);
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);

    return { postUrl: page.url(), metadata: { platform: "facebook", type: "reel" } };
  }

  private async submitPost(page: any): Promise<void> {
    const nextSelectors = [
      'text=/^Tiếp$|^Next$/i',
      '[aria-label="Tiếp"]',
      '[aria-label="Next"]'
    ];
    const publishSelectors = [
      'text=/^Post$|^Đăng$|^Publish$|^Xuất bản$/i',
      '[aria-label="Post"]',
      '[aria-label*="Đăng" i]',
      '[aria-label*="Publish" i]'
    ];

    for (let step = 0; step < 3; step += 1) {
      const published = await clickFirstVisible(page, publishSelectors, { timeout: 3_000 });
      if (published) return;

      const advanced = await clickFirstVisible(page, nextSelectors, { timeout: 3_000 });
      if (!advanced) break;
      await page.waitForTimeout(1_500);
    }

    await clickFirst(page, publishSelectors, { timeout: 20_000 });
  }

  private async openComposer(page: any): Promise<void> {
    const selectors = [
      'div[role="button"][aria-label*="mind" i]',
      'div[role="button"][aria-label*="nghĩ gì" i]',
      '[aria-label*="Create a post" i]',
      '[aria-label*="Tạo bài viết" i]',
      'div[role="button"]:has-text("What\'s on your mind")',
      'div[role="button"]:has-text("Bạn đang nghĩ gì")',
      "text=/What's on your mind|Bạn đang nghĩ gì|What are you thinking|Tạo bài viết/i"
    ];

    try {
      await clickFirst(page, selectors, { timeout: 8_000 });
    } catch {
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 40_000 });
      await dismissCookieDialog(page);
      await clickFirst(page, selectors, { timeout: 15_000 });
    }
  }

  private async ensureAuthenticated(page: any, context: any): Promise<void> {
    const authState = await this.inspectAuth(page, context);
    if (authState.kind === "checkpoint") {
      throw new AdapterCheckpointError(authState.message, authState.metadata);
    }
    if (authState.kind !== "ok") {
      throw new AdapterAuthError(authState.message, authState.metadata);
    }
  }

  private async inspectAuth(page: any, context: any): Promise<{ kind: "ok" | "auth" | "checkpoint"; message: string; metadata: Record<string, unknown> }> {
    const cookies = await context.cookies();
    const cookieNames = new Set<string>(cookies.map((cookie: { name: string }) => cookie.name));
    const hasAuthCookies = AUTH_COOKIE_NAMES.every((name) => cookieNames.has(name));

    const state = await page.evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() || "";
      const hasCredentialInputs = !!document.querySelector('input[name="email"], input[name="pass"]');
      const authPhrases = [
        "see more on facebook",
        "log in to facebook",
        "email address or phone number",
        "email address or mobile number",
        "create new account"
      ];
      const checkpointPhrases = [
        "checkpoint",
        "review recent login",
        "secure your account",
        "suspended",
        "confirm your identity",
        "two-factor",
        "two factor"
      ];
      return {
        hasCredentialInputs,
        hasAuthWall: hasCredentialInputs || authPhrases.some((phrase) => bodyText.includes(phrase)),
        hasCheckpoint: checkpointPhrases.some((phrase) => bodyText.includes(phrase)),
        url: window.location.href
      };
    });

    const metadata = {
      url: state.url,
      cookieNames: Array.from(cookieNames).sort(),
      hasCredentialInputs: state.hasCredentialInputs
    };

    if (state.hasCheckpoint) {
      return { kind: "checkpoint", message: "Facebook checkpoint or account review detected", metadata };
    }
    if (!hasAuthCookies || state.hasAuthWall) {
      return { kind: "auth", message: "Facebook session expired or not authenticated", metadata };
    }
    return { kind: "ok", message: "ok", metadata };
  }

  private async captureScreenshot(context: any, dir: string, name: string): Promise<string> {
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${name}.png`);
    const pages = context.pages();
    if (pages.length > 0) {
      await pages[0].screenshot({ path: filePath, fullPage: false });
    }
    return filePath;
  }

  private async openContext(account: AdapterAccount): Promise<{ browser: any; context: any }> {
    const authPath = readString(account.credentials, "authPath", `storage/sessions/facebook/${account.id}/auth.json`);
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({
      // Local/internal default: mở browser thật để dễ quan sát.
      // Có thể ép headless bằng config: { "headless": true }
      headless: (account.config as Record<string, unknown>)?.headless === true,
      args: ["--no-sandbox"]
    });

    const contextOptions: Record<string, unknown> = {
      viewport: { width: 1366, height: 900 }
    };

    if (existsSync(authPath)) {
      contextOptions.storageState = authPath;
    }

    const context = await browser.newContext(contextOptions);
    return { browser, context };
  }
}

function firstLocator(page: any, selectors: string[]) {
  return page.locator(selectors[0]);
}

async function clickFirst(page: any, selectors: string[], options: { timeout?: number } = {}) {
  let lastError: unknown;
  for (const selector of selectors) {
    try {
      await page.locator(selector).first().click({ timeout: options.timeout ?? 8_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Không click được selector nào: ${selectors.join(" | ")}`);
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
      // not found, try next
    }
  }
  return false;
}

async function dismissCookieDialog(page: any): Promise<void> {
  await page
    .getByRole("button", { name: /allow all cookies|accept all|accept cookies/i })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

function normalizeFacebookError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/checkpoint|challenge|review recent login|secure your account|confirm your identity|suspended|two-factor|two factor/i.test(message)) {
    return new AdapterCheckpointError(message);
  }
  if (/login|password|session expired|not authenticated/i.test(message)) {
    return new AdapterAuthError(message);
  }
  if (/timeout|net::|ECONN|Target closed/i.test(message)) {
    return new RetryableNetworkError(message);
  }
  return error instanceof Error ? error : new Error(message);
}
