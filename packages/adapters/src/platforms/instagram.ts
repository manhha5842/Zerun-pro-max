import { mkdirSync } from "node:fs";
import path from "node:path";
import { AdapterAuthError, AdapterCheckpointError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CommentInput, CommentResult, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readString } from "../utils/credentials.js";
import { clickFirst, clickFirstVisible, hasVisible } from "../utils/playwright-helpers.js";

export class InstagramAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "instagram";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const { browser, context } = await this.openContext(account);
    try {
      const page = await context.newPage();
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30_000 });
      const state = await inspectInstagramAuth(page);
      if (state.kind === "checkpoint") {
        return { status: "checkpoint", message: "Instagram checkpoint or account review detected", metadata: state.metadata };
      }
      if (state.kind === "auth") {
        return { status: "failed", message: "Instagram session expired or not authenticated", metadata: state.metadata };
      }
      return { status: "healthy", message: "Instagram session is valid", metadata: state.metadata };
    } catch (error) {
      return { status: "degraded", message: normalizeInstagramError(error).message };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const ig = await this.login(input.account);
    const targetUsername = readString(input.account.credentials, "targetUsername", input.account.handle ?? undefined);

    try {
      const user = await ig.user.searchExact(targetUsername.replace(/^@/, ""));
      const feed = ig.feed.user(user.pk);
      const items = await feed.items();
      return {
        items: items.slice(0, input.limit ?? 20).map((item: any) => ({
          platform: this.platform,
          sourceId: input.account.id,
          externalId: String(item.id),
          author: targetUsername,
          text: item.caption?.text ?? "",
          media: collectInstagramMedia(item),
          originalUrl: item.code ? `https://www.instagram.com/p/${item.code}/` : undefined,
          postedAt: item.taken_at ? new Date(item.taken_at * 1000) : undefined,
          metadata: { mediaType: item.media_type }
        }))
      };
    } catch (error) {
      throw normalizeInstagramError(error);
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const mediaPaths = input.media.map((m) => m.localPath ?? m.url ?? "").filter(Boolean);
    const requestedType = resolveInstagramPublishType(input);
    const isVideo = input.media[0]?.type === "video";
    const { browser, context } = await this.openContext(input.account);

    try {
      const page = await context.newPage();
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 40_000 });

      const authState = await inspectInstagramAuth(page);
      if (authState.kind === "checkpoint") {
        throw new AdapterCheckpointError("Instagram checkpoint detected", authState.metadata);
      }
      if (authState.kind === "auth") {
        throw new AdapterAuthError("Instagram session expired or not authenticated", authState.metadata);
      }

      if (requestedType === "story") {
        if (mediaPaths.length !== 1) throw new Error("Instagram story requires exactly one media file");
        return await this.doPublishStory(page, mediaPaths[0]);
      }

      if (requestedType === "reel") {
        if (!mediaPaths[0]) throw new Error("Instagram reel requires one video file");
        return await this.publishReel(page, input.text, mediaPaths[0]);
      }

      if (isVideo && mediaPaths.length === 1) {
        return await this.publishReel(page, input.text, mediaPaths[0]);
      }
      return await this.publishFeed(page, input.text, mediaPaths);
    } catch (error) {
      await captureScreenshot(context, "storage/screenshots", `ig-error-${Date.now()}`).catch(() => undefined);
      throw normalizeInstagramError(error);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async comment(input: CommentInput): Promise<CommentResult> {
    if ((input.media?.length ?? 0) > 0) {
      throw new Error("Instagram web comment does not support media attachments.");
    }

    const { browser, context } = await this.openContext(input.account);
    try {
      const page = await context.newPage();
      await page.goto(input.postUrl, { waitUntil: "domcontentloaded", timeout: 40_000 });

      const authState = await inspectInstagramAuth(page);
      if (authState.kind === "checkpoint") {
        throw new AdapterCheckpointError("Instagram checkpoint detected", authState.metadata);
      }
      if (authState.kind === "auth") {
        throw new AdapterAuthError("Instagram session expired or not authenticated", authState.metadata);
      }

      await page.waitForTimeout(1_500);

      await clickFirstVisible(page, [
        '[aria-label*="Comment" i]',
        '[aria-label*="Bình luận" i]',
        'svg[aria-label*="Comment" i]',
        'button:has(svg[aria-label*="Comment" i])',
        'a[href*="/comments/"]'
      ], { timeout: 8_000 }).catch(() => false);

      const textbox = page.locator('textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], textarea, [contenteditable="true"][role="textbox"]').first();
      await textbox.click({ timeout: 12_000 });
      await textbox.fill(input.text);
      await page.waitForTimeout(400);

      const posted = await clickFirstVisible(page, [
        'button:has-text("Post")',
        'button:has-text("Đăng")',
        'div[role="button"]:has-text("Post")',
        'text=/^Post$|^Đăng$/i'
      ], { timeout: 8_000 }).catch(() => false);

      if (!posted) {
        await page.keyboard.press("Enter").catch(() => undefined);
      }

      await page.waitForTimeout(1_500);
      return { url: input.postUrl, metadata: { platform: this.platform, type: "comment" } };
    } catch (error) {
      await captureScreenshot(context, "storage/screenshots", `ig-comment-error-${Date.now()}`).catch(() => undefined);
      throw normalizeInstagramError(error);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async publishStory(account: AdapterAccount, mediaPath: string): Promise<PublishResult> {
    const { browser, context } = await this.openContext(account);
    try {
      const page = await context.newPage();
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 40_000 });
      const authState = await inspectInstagramAuth(page);
      if (authState.kind === "checkpoint") {
        throw new AdapterCheckpointError("Instagram checkpoint detected", authState.metadata);
      }
      if (authState.kind === "auth") {
        throw new AdapterAuthError("Instagram session expired or not authenticated", authState.metadata);
      }
      return await this.doPublishStory(page, mediaPath);
    } catch (error) {
      await captureScreenshot(context, "storage/screenshots", `ig-story-error-${Date.now()}`).catch(() => undefined);
      throw normalizeInstagramError(error);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  private async publishFeed(page: any, caption: string, mediaPaths: string[]): Promise<PublishResult> {
    await clickFirst(page, [
      '[aria-label*="Create" i]',
      '[aria-label*="New post" i]',
      '[aria-label*="Tao" i]',
      'svg[aria-label*="New post" i]',
      'a[href="/#create"]',
      'a[href*="/create/select/"]',
      'text=/Create|Tạo|New post/i'
    ], { timeout: 15_000 });

    await clickFirstVisible(page, [
      'text=/^Post$/i',
      '[aria-label*="Post" i]',
      'span:has-text("Post")',
      'div[role="button"]:has-text("Post")'
    ], { timeout: 5_000 }).catch(() => false);

    await page.waitForTimeout(1_000);

    if (mediaPaths.length > 0) {
      const fileInput = page.locator('input[type="file"]');
      if (await fileInput.count() > 0) {
        await fileInput.first().setInputFiles(mediaPaths);
      } else {
        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 15_000 }),
          clickFirst(page, [
            'text=/Select from computer/i',
            'button:has-text("Select")',
            '[aria-label*="Select" i]'
          ], { timeout: 15_000 })
        ]);
        await fileChooser.setFiles(mediaPaths);
      }
      await page.waitForTimeout(3_000);
    }

    // Loop Next/Continue until Share screen appears (similar to reel flow)
    for (let step = 0; step < 3; step += 1) {
      const shareVisible = await hasVisible(page, [
        'button:has-text("Share")',
        '[aria-label*="Share" i]',
        'text=/^Share$/i'
      ], 3_000);
      if (shareVisible) break;

      const nextClicked = await clickFirstVisible(page, [
        'button:has-text("Next")',
        'button:has-text("Continue")',
        '[aria-label*="Next" i]',
        '[aria-label*="Continue" i]',
        'text=/^Next$|^Continue$/i'
      ], { timeout: 6_000 }).catch(() => false);

      if (!nextClicked) break;
      await page.waitForTimeout(1_500);
    }

    if (caption) {
      const textbox = page.locator('[aria-label*="Write a caption" i], textarea[aria-label*="caption" i], [contenteditable="true"][role="textbox"], textarea').first();
      await textbox.click({ timeout: 10_000 });
      await textbox.fill(caption);
      await page.waitForTimeout(500);
    }

    let shared = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      shared = await clickFirstVisible(page, [
        'button:has-text("Share")',
        '[aria-label*="Share" i]',
        'text=/^Share$/i',
        'div[role="button"]:has-text("Share")',
        'button[type="submit"]'
      ], { timeout: 8_000 }).catch(() => false);
      if (shared) break;
      await page.waitForTimeout(1_000);
    }

    if (!shared) {
      throw new Error("Could not find the Share button for Instagram feed post.");
    }

    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    return { url: page.url(), metadata: { platform: "instagram", type: "feed" } };
  }

  private async doPublishStory(page: any, mediaPath: string): Promise<PublishResult> {
    if (!mediaPath) throw new Error("Story requires exactly one media file");

    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 40_000 });
    await clickFirst(page, [
      '[aria-label*="story" i]',
      '[aria-label*="Your Story" i]',
      'canvas[aria-label*="story" i]',
      'header canvas',
      'text=/Your Story|Tin của bạn|Story của bạn/i'
    ], { timeout: 15_000 });

    const fileInput = page.locator('input[type="file"][accept*="image"], input[type="file"][accept*="video"], input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles([mediaPath]);
    } else {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15_000 }),
        clickFirst(page, [
          '[aria-label*="Upload" i]',
          '[aria-label*="Add to story" i]',
          '[aria-label*="Your story" i]',
          'button:has-text("Add")',
          'text=/Upload|Add to story|Your story/i'
        ], { timeout: 15_000 })
      ]);
      await fileChooser.setFiles([mediaPath]);
    }

    await page.waitForTimeout(4_000);

    await clickFirstVisible(page, [
      'button:has-text("Next")',
      '[aria-label*="Next" i]',
      'text=/^Next$|^Tiếp$/i'
    ], { timeout: 6_000 }).catch(() => false);

    await page.waitForTimeout(1_000);

    await clickFirst(page, [
      'text=/Add to story|Your story|Chia sẻ lên tin|Tin của bạn|Share to story/i',
      '[aria-label*="Add to story" i]',
      '[aria-label*="Your story" i]',
      '[aria-label*="Share" i]',
      'button:has-text("Share")',
      'button:has-text("Your story")',
      'div[role="button"]:has-text("Your story")'
    ], { timeout: 20_000 });

    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(2_000);
    return { url: page.url(), metadata: { platform: "instagram", type: "story" } };
  }

  private async publishReel(page: any, caption: string, videoPath: string): Promise<PublishResult> {
    if (!videoPath) throw new Error("Reel requires exactly one video");

    await clickFirst(page, [
      '[aria-label*="Create" i]',
      '[aria-label*="New post" i]',
      '[aria-label*="Tao" i]',
      'text=/Create|New post|Tạo/i'
    ], { timeout: 15_000 });

    await clickFirstVisible(page, [
      '[aria-label*="Reel" i]',
      'text=/^Reel$/i',
      'span:has-text("Reel")',
      'svg[aria-label="Reel"]'
    ], { timeout: 8_000 }).catch(() => false);

    await page.waitForTimeout(1_000);

    const fileInput = page.locator('input[type="file"][accept*="video"], input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles([videoPath]);
    } else {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15_000 }),
        clickFirst(page, [
          'text=/Select from computer/i',
          '[aria-label*="Select" i]',
          'button:has-text("Select")'
        ], { timeout: 15_000 })
      ]);
      await fileChooser.setFiles([videoPath]);
    }

    await page.waitForTimeout(5_000);

    for (let step = 0; step < 3; step += 1) {
      const shareVisible = await hasVisible(page, [
        'button:has-text("Share")',
        '[aria-label*="Share" i]',
        'text=/^Share$/i',
        'button[type="submit"]'
      ], 3_000);
      if (shareVisible) break;

      const nextClicked = await clickFirstVisible(page, [
        'button:has-text("Next")',
        'button:has-text("Continue")',
        '[aria-label*="Next" i]',
        '[aria-label*="Continue" i]',
        'text=/^Next$|^Continue$/i'
      ], { timeout: 6_000 }).catch(() => false);

      if (!nextClicked) break;
      await page.waitForTimeout(1_500);
    }

    if (caption) {
      const textbox = page.locator('[aria-label*="Write a caption" i], textarea[aria-label*="caption" i], [contenteditable="true"][role="textbox"], textarea').first();
      await textbox.click({ timeout: 10_000 });
      await textbox.fill(caption);
      await page.waitForTimeout(500);
    }

    let shared = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      shared = await clickFirstVisible(page, [
        'button:has-text("Share")',
        '[aria-label*="Share" i]',
        'text=/^Share$/i',
        'div[role="button"]:has-text("Share")',
        'button[type="submit"]'
      ], { timeout: 8_000 }).catch(() => false);
      if (shared) break;
      await page.waitForTimeout(1_000);
    }

    if (!shared) {
      throw new Error("Could not find the Share button for Instagram reel.");
    }

    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    return { url: page.url(), metadata: { platform: "instagram", type: "reel" } };
  }

  private async login(account: AdapterAccount): Promise<any> {
    const username = readString(account.credentials, "username");
    const password = readString(account.credentials, "password");
    const { IgApiClient } = await import("instagram-private-api");
    const ig = new IgApiClient();
    ig.state.generateDevice(username);
    await ig.account.login(username, password);
    return ig;
  }

  private async openContext(account: AdapterAccount): Promise<{ browser: any; context: any }> {
    const sessionDir = readString(account.credentials, "sessionDir", `storage/sessions/instagram/${account.id}`);
    const { chromium } = await import("playwright");
    const context = await chromium.launchPersistentContext(sessionDir, {
      headless: (account.config as Record<string, unknown>)?.headless === true,
      viewport: { width: 1366, height: 900 },
      args: ["--no-sandbox"]
    });
    return { browser: { close: () => Promise.resolve() }, context };
  }
}

async function inspectInstagramAuth(page: any): Promise<{ kind: "ok" | "auth" | "checkpoint"; metadata: Record<string, unknown> }> {
  const state = await page.evaluate(() => {
    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    const hasLoginForm = !!document.querySelector('input[name="username"], input[name="password"]');
    const checkpointPhrases = ["checkpoint", "review recent login", "suspended", "confirm your identity", "unusual login"];
    const authPhrases = ["log in", "create new account", "sign up"];
    return {
      hasLoginForm,
      hasCheckpoint: checkpointPhrases.some((p) => bodyText.includes(p)),
      hasAuthWall: hasLoginForm || authPhrases.some((p) => bodyText.includes(p)),
      url: window.location.href
    };
  });

  const metadata = { url: state.url };

  if (state.hasCheckpoint) {
    return { kind: "checkpoint", metadata };
  }
  if (state.hasAuthWall) {
    return { kind: "auth", metadata };
  }
  return { kind: "ok", metadata };
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

function resolveInstagramPublishType(input: PublishInput): "feed" | "story" | "reel" {
  const metadataType = String(input.media[0]?.metadata?.postType ?? input.media[0]?.metadata?.type ?? "").toLowerCase();
  const configType = String((input.account.config as Record<string, unknown>)?.publishType ?? "").toLowerCase();
  const combined = metadataType || configType;
  if (combined === "story") return "story";
  if (combined === "reel") return "reel";
  return "feed";
}

function collectInstagramMedia(item: any) {
  const candidates = item.carousel_media ?? [item];
  return candidates.flatMap((entry: any) => {
    const imageUrl = entry.image_versions2?.candidates?.[0]?.url;
    const videoUrl = entry.video_versions?.[0]?.url;
    if (videoUrl) return [{ type: "video" as const, url: videoUrl, metadata: { source: "instagram" } }];
    if (imageUrl) return [{ type: "image" as const, url: imageUrl, metadata: { source: "instagram" } }];
    return [];
  });
}

function normalizeInstagramError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/checkpoint|challenge|suspended|confirm your identity/i.test(message)) return new AdapterCheckpointError(message);
  if (/login|password|session expired|not authenticated/i.test(message)) return new AdapterAuthError(message);
  if (/timeout|net::|ECONN|Target closed/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
