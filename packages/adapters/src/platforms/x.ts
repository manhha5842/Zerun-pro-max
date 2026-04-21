import { AdapterAuthError, ConfigurationError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readOptionalString, readString } from "../utils/credentials.js";

export class XAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "x";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    if ((account.config as Record<string, unknown>)?.usePlaywright === true) {
      return this.testConnectionPlaywright(account);
    }

    const scraper = await this.login(account);
    const username = readString(account.credentials, "username");
    const profile = await scraper.getProfile(username);
    return profile ? { status: "healthy", message: "X/Twitter login hợp lệ" } : { status: "degraded", message: "Không đọc được profile sau login" };
  }

  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const scraper = await this.login(input.account);
    const sourceUsername = readString(input.account.credentials, "sourceUsername", input.account.handle ?? undefined);
    const limit = input.limit ?? Number(input.account.config.limit ?? 20);
    const tweets: any[] = [];

    try {
      const iterator = scraper.getTweets(sourceUsername.replace(/^@/, ""), limit);
      for await (const tweet of iterator) {
        tweets.push(tweet);
      }
    } catch (error) {
      throw normalizeXError(error);
    }

    return {
      items: tweets
        .filter((tweet) => typeof tweet?.text === "string" && tweet.text.trim().length > 0)
        .map((tweet) => ({
          platform: this.platform,
          sourceId: input.account.id,
          externalId: String(tweet.id ?? tweet.conversationId),
          author: tweet.username,
          text: tweet.text,
          media: [],
          originalUrl: tweet.permanentUrl,
          postedAt: tweet.timeParsed ? new Date(tweet.timeParsed) : undefined,
          metadata: { likes: tweet.likes, retweets: tweet.retweets }
        }))
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if ((input.account.config as Record<string, unknown>)?.usePlaywright === true) {
      return this.publishViaPlaywright(input);
    }

    const scraper = await this.login(input.account);
    try {
      const response = await scraper.sendTweet(input.text);
      const json = typeof response?.json === "function" ? await response.json() : response;
      const externalId = json?.data?.create_tweet?.tweet_results?.result?.rest_id ?? json?.id_str;
      return {
        externalId: externalId ? String(externalId) : undefined,
        url: externalId ? `https://x.com/i/web/status/${externalId}` : undefined,
        metadata: { response: json, mode: "api" }
      };
    } catch (error) {
      throw normalizeXError(error);
    }
  }

  private async testConnectionPlaywright(account: AdapterAccount): Promise<AdapterHealth> {
    const context = await this.openContext(account);
    try {
      const page = await context.newPage();
      await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 30_000 });
      const state = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        return {
          hasLoginWall: bodyText.includes("sign in") || bodyText.includes("login") || bodyText.includes("đăng nhập"),
          url: window.location.href
        };
      });
      if (state.hasLoginWall || state.url.includes("/login")) {
        return { status: "failed", message: "X browser session chưa đăng nhập" };
      }
      return { status: "healthy", message: "X browser session hợp lệ", metadata: { url: state.url } };
    } catch (error) {
      throw normalizeXError(error);
    } finally {
      await context.close();
    }
  }

  private async publishViaPlaywright(input: PublishInput): Promise<PublishResult> {
    const context = await this.openContext(input.account);
    const mediaPaths = input.media.map((m) => m.localPath ?? "").filter(Boolean);

    try {
      const page = await context.newPage();
      await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 40_000 });

      const state = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        return {
          hasLoginWall: bodyText.includes("sign in") || bodyText.includes("login") || bodyText.includes("đăng nhập"),
          url: window.location.href
        };
      });
      if (state.hasLoginWall || state.url.includes("/login")) {
        throw new AdapterAuthError("X browser session chưa đăng nhập");
      }

      const textbox = page.locator('[data-testid="tweetTextarea_0"], [aria-label*="Post" i], div[role="textbox"]').first();
      await textbox.click({ timeout: 15_000 });
      await textbox.fill(input.text);
      await page.waitForTimeout(300);

      if (mediaPaths.length > 0) {
        const mediaButton = page.locator('[data-testid="fileInput"]').first();
        if (await mediaButton.count()) {
          await mediaButton.setInputFiles(mediaPaths);
        } else {
          const [fileChooser] = await Promise.all([
            page.waitForEvent("filechooser", { timeout: 10_000 }),
            page.locator('[data-testid="toolBar"] [role="button"], [aria-label*="Media" i]').first().click({ timeout: 10_000 })
          ]);
          await fileChooser.setFiles(mediaPaths);
        }
        await page.waitForTimeout(3_000);
      }

      await page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').first().click({ timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      return { url: page.url(), metadata: { mode: "playwright" } };
    } catch (error) {
      throw normalizeXError(error);
    } finally {
      await context.close();
    }
  }

  private async openContext(account: AdapterAccount): Promise<any> {
    const sessionDir = readString(account.credentials, "sessionDir", `storage/sessions/x/${account.id}`);
    const { chromium } = await import("playwright");
    return chromium.launchPersistentContext(sessionDir, {
      headless: (account.config as Record<string, unknown>)?.headless === true,
      viewport: { width: 1366, height: 900 },
      args: ["--no-sandbox"]
    });
  }

  private async login(account: AdapterAccount): Promise<any> {
    const username = readString(account.credentials, "username");
    const password = readString(account.credentials, "password");
    const email = readOptionalString(account.credentials, "email");
    const twoFactorSecret = readOptionalString(account.credentials, "twoFactorSecret");

    const { Scraper } = await import("agent-twitter-client");
    const scraper = new Scraper();
    await scraper.login(username, password, email, twoFactorSecret);
    const loggedIn = typeof scraper.isLoggedIn === "function" ? await scraper.isLoggedIn() : true;
    if (!loggedIn) throw new AdapterAuthError("X/Twitter login thất bại");
    return scraper;
  }
}

function normalizeXError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/login|auth|credential|password|2fa|sign in/i.test(message)) return new AdapterAuthError(message);
  if (/rate|too many|timeout|network|ECONN|Target closed/i.test(message)) return new RetryableNetworkError(message);
  if (/method/i.test(message)) return new ConfigurationError(`agent-twitter-client không hỗ trợ method đang gọi: ${message}`);
  return error instanceof Error ? error : new Error(message);
}
