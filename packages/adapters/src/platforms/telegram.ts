import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AdapterAuthError, ConfigurationError, RetryableNetworkError, withRetry, type Platform } from "@zerun/shared";
import type { AdapterAccount, AdapterHealth, CrawlInput, CrawlResult, PublishAdapter, PublishInput, PublishResult, RawMedia, SourceAdapter } from "../contracts.js";
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
      const minId = readOptionalPositiveNumber(input.account.config, "telegramMinId");
      const messages = await withRetry<any[]>(
        () => client.getMessages(source, {
          limit: input.limit ?? Number(input.account.config.limit ?? 20),
          ...(minId ? { minId } : {})
        }),
        { label: "telegram:crawl", retries: 2 }
      );
      const items = (await Promise.all(messages.map(async (message: any) => {
        const text = typeof message?.message === "string" ? message.message : "";
        const media = await downloadTelegramMedia(client, input.account, String(source), message);
        if (text.trim().length === 0 && media.length === 0) return null;

        return {
          platform: this.platform,
          sourceId: input.account.id,
          externalId: String(message.id),
          author: message.senderId ? String(message.senderId) : undefined,
          text,
          media,
          originalUrl: `https://t.me/${String(source).replace(/^@/, "")}/${message.id}`,
          postedAt: message.date ? new Date(message.date * 1000) : undefined,
          metadata: { groupedId: message.groupedId?.toString?.() }
        };
      }))).filter((item): item is NonNullable<typeof item> => Boolean(item));

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
      const files = input.media
        .map((media) => media.localPath ?? media.url)
        .filter((file): file is string => typeof file === "string" && file.trim().length > 0);
      const result = await withRetry<any>(() => (
        files.length > 0
          ? client.sendFile(target, { file: files.length === 1 ? files[0] : files, caption: input.text, supportsStreaming: true })
          : client.sendMessage(target, { message: input.text })
      ), {
        label: "telegram:publish",
        retries: 2
      });
      const firstResult = Array.isArray(result) ? result[0] : result;
      return {
        externalId: firstResult?.id ? String(firstResult.id) : undefined,
        url: firstResult?.id ? `https://t.me/${String(target).replace(/^@/, "")}/${firstResult.id}` : undefined,
        metadata: { platform: this.platform, mediaCount: files.length }
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
      connectionRetries: 3,
      // FLOOD_WAIT ≤ 5 phút: GramJS tự sleep rồi tiếp, không ném lỗi (không crash).
      // Lớn hơn → ném ra, để withRetry/alert xử lý.
      floodSleepThreshold: 300
    });
  }
}

async function downloadTelegramMedia(client: any, account: AdapterAccount, source: string, message: any): Promise<RawMedia[]> {
  if (!message?.media) return [];

  const descriptor = describeTelegramMedia(message);
  const dir = resolveTelegramMediaDir(account);
  mkdirSync(dir, { recursive: true });

  const safeSource = safeFileSegment(source.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, ""));
  const filePath = path.join(dir, `tg-${safeSource}-${message.id}-${Date.now()}${descriptor.extension}`);

  try {
    const result = await client.downloadMedia(message, { outputFile: filePath });
    if (Buffer.isBuffer(result)) {
      writeFileSync(filePath, result);
    }
    const localPath = typeof result === "string" ? result : filePath;
    return [{
      type: descriptor.type,
      mimeType: descriptor.mimeType,
      localPath,
      metadata: {
        source: "telegram",
        messageId: String(message.id),
        groupedId: message.groupedId?.toString?.()
      }
    }];
  } catch (error) {
    return [{
      type: descriptor.type,
      mimeType: descriptor.mimeType,
      metadata: {
        source: "telegram",
        messageId: String(message.id),
        groupedId: message.groupedId?.toString?.(),
        downloadError: error instanceof Error ? error.message : String(error)
      }
    }];
  }
}

function describeTelegramMedia(message: any): { type: RawMedia["type"]; mimeType?: string; extension: string } {
  const media = message?.media;
  const className = String(media?.className ?? media?.constructor?.name ?? "");
  const document = media?.document;
  const mimeType = typeof document?.mimeType === "string" ? document.mimeType : undefined;

  if (mimeType?.startsWith("video/")) return { type: "video", mimeType, extension: extensionForMime(mimeType, ".mp4") };
  if (mimeType?.startsWith("image/")) return { type: "image", mimeType, extension: extensionForMime(mimeType, ".jpg") };
  if (/photo/i.test(className)) return { type: "image", mimeType: "image/jpeg", extension: ".jpg" };
  return { type: "document", mimeType, extension: extensionForMime(mimeType, ".bin") };
}

function extensionForMime(mimeType: string | undefined, fallback: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "video/webm") return ".webm";
  return fallback;
}

function resolveTelegramMediaDir(account: AdapterAccount) {
  const configuredDir = readOptionalString(account.config, "mediaDir");
  const root = configuredDir ?? process.env.MEDIA_UPLOAD_ROOT ?? process.env.MEDIA_STORAGE_DIR ?? path.resolve("storage/uploads");
  return path.join(root, "telegram", safeFileSegment(account.id));
}

function safeFileSegment(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "media";
}

function readOptionalPositiveNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeTelegramError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/AUTH|SESSION|PASSWORD|LOGIN/i.test(message)) return new AdapterAuthError(message);
  if (/TIMEOUT|ECONN|NETWORK|FLOOD/i.test(message)) return new RetryableNetworkError(message);
  return error instanceof Error ? error : new Error(message);
}
