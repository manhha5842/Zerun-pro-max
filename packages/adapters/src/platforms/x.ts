import { AdapterAuthError, ConfigurationError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readOptionalString, readString } from "../utils/credentials.js";

export class XAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "x";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
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
    const scraper = await this.login(input.account);
    try {
      const response = await scraper.sendTweet(input.text);
      const json = typeof response?.json === "function" ? await response.json() : response;
      const externalId = json?.data?.create_tweet?.tweet_results?.result?.rest_id ?? json?.id_str;
      return {
        externalId: externalId ? String(externalId) : undefined,
        url: externalId ? `https://x.com/i/web/status/${externalId}` : undefined,
        metadata: { response: json }
      };
    } catch (error) {
      throw normalizeXError(error);
    }
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
  if (/login|auth|credential|password|2fa/i.test(message)) return new AdapterAuthError(message);
  if (/rate|too many|timeout|network|ECONN/i.test(message)) return new RetryableNetworkError(message);
  if (/method/i.test(message)) return new ConfigurationError(`agent-twitter-client không hỗ trợ method đang gọi: ${message}`);
  return error instanceof Error ? error : new Error(message);
}
