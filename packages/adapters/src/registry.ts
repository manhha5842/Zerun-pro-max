import type { Platform } from "@zerun/shared";
import type { AffiliateAdapter, PublishAdapter, SourceAdapter } from "./contracts.js";
import { AccessTradeAffiliateAdapter } from "./affiliate/accesstrade.js";
import { FacebookAdapter } from "./platforms/facebook.js";
import { InstagramAdapter } from "./platforms/instagram.js";
import { TelegramAdapter } from "./platforms/telegram.js";
import { ThreadsAdapter } from "./platforms/threads.js";
import { XAdapter } from "./platforms/x.js";
import { ZaloBotAdapter } from "./platforms/zalo-bot.js";
import { ZaloWebAdapter } from "./platforms/zalo-web.js";

export class AdapterRegistry {
  private readonly sourceAdapters = new Map<Platform, SourceAdapter>();
  private readonly publishAdapters = new Map<Platform, PublishAdapter>();

  constructor(readonly affiliateAdapter: AffiliateAdapter = new AccessTradeAffiliateAdapter()) {}

  registerSource(adapter: SourceAdapter): this {
    this.sourceAdapters.set(adapter.platform, adapter);
    return this;
  }

  registerPublish(adapter: PublishAdapter): this {
    this.publishAdapters.set(adapter.platform, adapter);
    return this;
  }

  getSource(platform: Platform): SourceAdapter {
    const adapter = this.sourceAdapters.get(platform);
    if (!adapter) throw new Error(`Chưa đăng ký source adapter cho ${platform}`);
    return adapter;
  }

  getPublish(platform: Platform): PublishAdapter {
    const adapter = this.publishAdapters.get(platform);
    if (!adapter) throw new Error(`Chưa đăng ký publish adapter cho ${platform}`);
    return adapter;
  }
}

export function createRealAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  const telegram = new TelegramAdapter();
  const x = new XAdapter();
  const threads = new ThreadsAdapter();
  const instagram = new InstagramAdapter();
  const facebook = new FacebookAdapter();
  const zaloBot = new ZaloBotAdapter();
  const zaloWeb = new ZaloWebAdapter();

  return registry
    .registerSource(telegram)
    .registerPublish(telegram)
    .registerSource(x)
    .registerPublish(x)
    .registerSource(threads)
    .registerPublish(threads)
    .registerSource(instagram)
    .registerPublish(instagram)
    .registerSource(facebook)
    .registerPublish(facebook)
    .registerSource(zaloBot)
    .registerPublish(zaloBot)
    .registerSource(zaloWeb)
    .registerPublish(zaloWeb);
}
