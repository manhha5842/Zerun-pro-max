import { AdapterAuthError, ConfigurationError, RetryableNetworkError, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, SourceAdapter } from "../contracts.js";
import { readNumber, readOptionalString, readString } from "../utils/credentials.js";

export class TelegramAdapter implements SourceAdapter, PublishAdapter {
  readonly platform: Platform = "telegram";

  async testConnection(account: AdapterAccount): Promise<AdapterHealth> {
    const client = await this.createClient(account);
    try {
      await client.connect();
      const connected = await client.isUserAuthorized();
      return connected ? { status: "healthy", message: "Telegram session hợp lệ" } : { status: "failed", message: "Telegram session chưa đăng nhập" };
    } finally {
      await client.disconnect();
    }
  }

  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const source = readString(input.account.credentials, "source", input.account.handle ?? undefined);
    const client = await this.createClient(input.account);

    try {
      await client.connect();
      const messages = await client.getMessages(source, { limit: input.limit ?? Number(input.account.config.limit ?? 20) });
      const items = messages
        .filter((message: any) => typeof message?.message === "string" && message.message.trim().length > 0)
        .map((message: any) => ({
          platform: this.platform,
          sourceId: input.account.id,
          externalId: String(message.id),
          author: message.senderId ? String(message.senderId) : undefined,
          text: message.message,
          media: [],
          originalUrl: `https://t.me/${String(source).replace(/^@/, "")}/${message.id}`,
          postedAt: message.date ? new Date(message.date * 1000) : undefined,
          metadata: { groupedId: message.groupedId?.toString?.() }
        }));

      return { items };
    } catch (error) {
      throw normalizeTelegramError(error);
    } finally {
      await client.disconnect();
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const target = readString(input.account.credentials, "target", input.account.handle ?? undefined);
    const client = await this.createClient(input.account);

    try {
      await client.connect();
      const result = await client.sendMessage(target, { message: input.text });
      return {
        externalId: result?.id ? String(result.id) : undefined,
        url: result?.id ? `https://t.me/${String(target).replace(/^@/, "")}/${result.id}` : undefined,
        metadata: { platform: this.platform }
      };
    } catch (error) {
      throw normalizeTelegramError(error);
    } finally {
      await client.disconnect();
    }
  }

  private async createClient(account: AdapterAccount): Promise<any> {
    const apiId = readNumber(account.credentials, "apiId");
    const apiHash = readString(account.credentials, "apiHash");
    const session = readOptionalString(account.credentials, "session");
    if (!session) throw new ConfigurationError("Telegram cần StringSession đã đăng nhập");

    const telegram = await import("telegram");
    const sessions = await import("telegram/sessions/index.js");
    return new telegram.TelegramClient(new sessions.StringSession(session), apiId, apiHash, {
      connectionRetries: 3
    });
  }
}

function normalizeTelegramError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/AUTH|SESSION|PASSWORD|LOGIN/i.test(message)) return new AdapterAuthError(message);
  if (/TIMEOUT|ECONN|NETWORK|FLOOD/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
