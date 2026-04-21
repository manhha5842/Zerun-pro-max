import { AdapterAuthError, ConfigurationError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readOptionalString, readString } from "../utils/credentials.js";

export class ThreadsAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "threads";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const context = await this.openContext(account);
    try {
      const page = await context.newPage();
      await page.goto("https://www.threads.net/", { waitUntil: "domcontentloaded" });
      const loginVisible = await page.locator("text=/Log in|Đăng nhập/i").first().isVisible().catch(() => false);
      return loginVisible ? { status: "degraded", message: "Threads cần đăng nhập trong persistent session" } : { status: "healthy", message: "Threads session có vẻ hợp lệ" };
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
      throw normalizeBrowserError(error);
    } finally {
      await context.close();
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const context = await this.openContext(input.account);

    try {
      const page = await context.newPage();
      await page.goto("https://www.threads.net/", { waitUntil: "networkidle" });
      await page.getByText(/Start a thread|Bắt đầu/i).first().click({ timeout: 15_000 });
      const textbox = page.getByRole("textbox").first();
      await textbox.fill(input.text);
      await page.getByText(/Post|Đăng/i).last().click({ timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      return { url: page.url(), metadata: { platform: this.platform } };
    } catch (error) {
      throw normalizeBrowserError(error);
    } finally {
      await context.close();
    }
  }

  private async openContext(account: AdapterAccount): Promise<any> {
    const sessionDir = readString(account.credentials, "sessionDir", `storage/sessions/threads/${account.id}`);
    const { chromium } = await import("playwright");
    return chromium.launchPersistentContext(sessionDir, {
      headless: account.config.headless !== false,
      viewport: { width: 1280, height: 900 }
    });
  }
}

function normalizeBrowserError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/login|checkpoint|challenge|password/i.test(message)) return new AdapterAuthError(message);
  if (/timeout|net::|ECONN|Target closed/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
