import type { Platform } from "@zerun/shared";
import type { AffiliateAdapter, PublishAdapter, RealtimeSourceAdapter, SourceAdapter } from "./contracts.js";
import { AccessTradeAffiliateAdapter } from "./affiliate/accesstrade.js";
import { AffiliateRouter } from "./affiliate/router.js";
import { ShopeeAffiliateAdapter } from "./affiliate/shopee-affiliate.js";
import { FacebookAdapter } from "./platforms/facebook.js";
import { InstagramAdapter } from "./platforms/instagram.js";
import { TelegramAdapter } from "./platforms/telegram.js";
import { ThreadsAdapter } from "./platforms/threads.js";
import { XAdapter } from "./platforms/x.js";
import { ZaloPersonalAdapter } from "./platforms/zalo-personal.js";

export class AdapterRegistry {
  private readonly sourceAdapters = new Map<Platform, SourceAdapter>();
  private readonly publishAdapters = new Map<Platform, PublishAdapter>();
  private readonly realtimeAdapters = new Map<Platform, RealtimeSourceAdapter>();

  constructor(
    readonly affiliateAdapter: AffiliateAdapter = new AffiliateRouter({
      providers: {
        shopee: new ShopeeAffiliateAdapter({ mode: "accesstrade" })
      },
      fallback: new AccessTradeAffiliateAdapter()
    })
  ) {}

  registerSource(adapter: SourceAdapter): this {
    this.sourceAdapters.set(adapter.platform, adapter);
    return this;
  }

  registerPublish(adapter: PublishAdapter): this {
    this.publishAdapters.set(adapter.platform, adapter);
    return this;
  }

  registerRealtime(adapter: RealtimeSourceAdapter): this {
    this.realtimeAdapters.set(adapter.platform, adapter);
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

  getRealtime(platform: Platform): RealtimeSourceAdapter {
    const adapter = this.realtimeAdapters.get(platform);
    if (!adapter) throw new Error(`Chưa đăng ký realtime adapter cho ${platform}`);
    return adapter;
  }

  /** Danh sách platform có realtime adapter (worker dùng để khởi động listener lúc boot). */
  listRealtimePlatforms(): Platform[] {
    return [...this.realtimeAdapters.keys()];
  }
}

export function createRealAdapterRegistry(options: { affiliateAdapter?: AffiliateAdapter } = {}): AdapterRegistry {
  const registry = new AdapterRegistry(options.affiliateAdapter);
  const telegram = new TelegramAdapter();
  const x = new XAdapter();
  const threads = new ThreadsAdapter();
  const instagram = new InstagramAdapter();
  const facebook = new FacebookAdapter();
  const zaloPersonal = new ZaloPersonalAdapter();

  return registry
    .registerSource(telegram)
    .registerRealtime(telegram)
    .registerPublish(telegram)
    .registerSource(x)
    .registerPublish(x)
    .registerSource(threads)
    .registerPublish(threads)
    .registerSource(instagram)
    .registerPublish(instagram)
    .registerSource(facebook)
    .registerPublish(facebook)
    .registerRealtime(zaloPersonal)
    .registerPublish(zaloPersonal);
}
