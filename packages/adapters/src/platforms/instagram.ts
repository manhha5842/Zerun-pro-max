import { AdapterAuthError, ConfigurationError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readString } from "../utils/credentials.js";

export class InstagramAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "instagram";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const ig = await this.login(account);
    const currentUser = await ig.account.currentUser();
    return currentUser ? { status: "healthy", message: "Instagram login hợp lệ", metadata: { username: currentUser.username } } : { status: "failed", message: "Không đọc được user Instagram" };
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
    if (input.media.length === 0 || !input.media[0]?.localPath) {
      throw new ConfigurationError("Instagram publish thật cần ít nhất một ảnh localPath");
    }

    const fs = await import("node:fs/promises");
    const ig = await this.login(input.account);
    const file = await fs.readFile(input.media[0].localPath);

    try {
      const result = await ig.publish.photo({
        file,
        caption: input.text
      });
      return {
        externalId: result?.media?.id,
        url: result?.media?.code ? `https://www.instagram.com/p/${result.media.code}/` : undefined,
        metadata: { media: result?.media }
      };
    } catch (error) {
      throw normalizeInstagramError(error);
    }
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
  if (/login|challenge|checkpoint|password|two_factor/i.test(message)) return new AdapterAuthError(message);
  if (/rate|timeout|ECONN|network/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
