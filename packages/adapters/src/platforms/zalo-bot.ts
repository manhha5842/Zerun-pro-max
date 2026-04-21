import { AdapterAuthError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readOptionalString, readString } from "../utils/credentials.js";

const ZALO_OA_API = "https://openapi.zalo.me/v3.0/oa";

export class ZaloBotAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "zalo-bot";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const accessToken = readString(account.credentials, "accessToken");
    try {
      const response = await fetch(`${ZALO_OA_API}/getoainfo`, {
        headers: { access_token: accessToken }
      });
      if (response.status === 401 || response.status === 403) {
        return { status: "failed", message: "Zalo OA access token không hợp lệ" };
      }
      if (!response.ok) {
        return { status: "degraded", message: `Zalo OA API lỗi HTTP ${response.status}` };
      }
      const data = await response.json();
      return { status: "healthy", message: "Zalo OA token hợp lệ", metadata: data };
    } catch (error) {
      throw normalizeZaloApiError(error);
    }
  }

  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const accessToken = readString(input.account.credentials, "accessToken");
    const offset = 0;
    const count = input.limit ?? 20;

    try {
      const url = new URL(`${ZALO_OA_API}/conversation`);
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("count", String(count));
      const response = await fetch(url, {
        headers: { access_token: accessToken }
      });
      if (!response.ok) throw new Error(`Zalo OA crawl failed with HTTP ${response.status}`);
      const data = await response.json();
      const items = Array.isArray(data?.data?.conversations) ? data.data.conversations : [];
      return {
        items: items.map((item: any) => ({
          platform: this.platform,
          sourceId: input.account.id,
          externalId: String(item?.user_id_by_oa ?? item?.src ?? Date.now()),
          author: item?.display_name,
          text: item?.last_message?.text ?? "",
          media: [],
          originalUrl: undefined,
          postedAt: item?.updated_time ? new Date(item.updated_time) : undefined,
          metadata: item
        }))
      };
    } catch (error) {
      throw normalizeZaloApiError(error);
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    // TODO: not yet implemented - Zalo OA publish is scaffold only; needs runtime validation before production use
    const accessToken = readString(input.account.credentials, "accessToken");
    const userId = readString(input.account.credentials, "userId", input.account.handle ?? undefined);
    const imageUrl = input.media.find((m) => m.type === "image")?.url ?? readOptionalString(input.account.credentials, "imageUrl");

    try {
      const payload = imageUrl
        ? {
            recipient: { user_id: userId },
            message: {
              text: input.text,
              attachment: {
                type: "template",
                payload: {
                  template_type: "media",
                  elements: [{ media_type: "image", url: imageUrl }]
                }
              }
            }
          }
        : {
            recipient: { user_id: userId },
            message: { text: input.text }
          };

      const response = await fetch(`${ZALO_OA_API}/message/cs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          access_token: accessToken
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Zalo OA publish failed with HTTP ${response.status}`);
      const data = await response.json();
      return {
        externalId: data?.data?.message_id ? String(data.data.message_id) : undefined,
        metadata: data
      };
    } catch (error) {
      throw normalizeZaloApiError(error);
    }
  }
}

function normalizeZaloApiError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|token|auth|unauthorized/i.test(message)) return new AdapterAuthError(message);
  if (/429|5\d\d|timeout|network|ECONN/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
