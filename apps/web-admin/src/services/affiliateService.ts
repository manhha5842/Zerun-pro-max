import { apiPost } from "../api/client";

export type ShopeeSubIds = {
  subId1: string;
  subId2: string;
  subId3: string;
  subId4: string;
  subId5: string;
};

export type ShopeeConfig = {
  enabled: boolean;
  primarySource: "accesstrade" | "web" | "affiliate_id";
  useFallback: boolean;
  fallbackSource: "accesstrade" | "web" | "affiliate_id";
  accessTradeToken: string;
  campaignId: string;
  affiliateId: string;
  replaceAffiliateId: boolean;
  outputType: "shortlink" | "full";
  subIds: ShopeeSubIds;
  testUrl: string;
};

export type LazadaSubIdSet = {
  id: string; // UUID/Client-side generated ID
  name: string; // Friendly name
  subId1: string;
  subId2: string;
  subId3: string;
  subId4: string;
  subId5: string;
  subId6: string;
  isDefault: boolean;
  subIdKey?: string; // subIdTemplateKey from Lazada Adsense
};

export type LazadaConfig = {
  enabled: boolean;
  primarySource: "lazada_api" | "accesstrade" | "web";
  useFallback: boolean;
  fallbackSource: "lazada_api" | "accesstrade" | "web";
  appKey: string;
  appSecret: string;
  accessToken: string;
  region: string;
  accessTradeToken: string;
  campaignId: string;
  subIdSets: LazadaSubIdSet[];
  testUrl: string;
};

export type TikTokShopTracking = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  sub1: string;
  sub2: string;
  sub3: string;
  sub4: string;
};

export type TikTokShopConfig = {
  enabled: boolean;
  source: "accesstrade";
  accessTradeToken: string;
  campaignId: string;
  tracking: TikTokShopTracking;
  testUrl: string;
};

export type NewAffiliateConfig = {
  shopee: ShopeeConfig;
  lazada: LazadaConfig;
  tiktokShop: TikTokShopConfig;
  unknownLinkAction: string;
};

// 1. Build Shopee Sub ID
export function buildShopeeSubId(subIds: ShopeeSubIds): string {
  const keys: Array<keyof ShopeeSubIds> = ["subId1", "subId2", "subId3", "subId4", "subId5"];
  const values = keys.map((k) => {
    const val = subIds[k]?.trim() || "";
    // Sanitize: chỉ cho phép chữ, số, gạch dưới. Loại bỏ dấu - để tránh xung đột
    return encodeURIComponent(val.replace(/[^a-zA-Z0-9_]/g, ""));
  });

  let lastNonEmptyIndex = -1;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== "") {
      lastNonEmptyIndex = i;
      break;
    }
  }

  if (lastNonEmptyIndex === -1) return "";
  return values.slice(0, lastNonEmptyIndex + 1).join("-");
}

// 2. Thay affiliate_id Shopee nếu URL là link affiliate đầy đủ
export function replaceShopeeAffiliateIdIfFullAffiliateUrl(urlStr: string, affiliateId: string): string {
  if (!affiliateId?.trim()) return urlStr;
  try {
    const url = new URL(urlStr);
    let matched = false;
    if (url.searchParams.has("affiliate_id")) {
      url.searchParams.set("affiliate_id", affiliateId.trim());
      matched = true;
    }
    const utmMedium = url.searchParams.get("utm_medium");
    const utmSource = url.searchParams.get("utm_source");
    if (utmMedium === "affiliates" && utmSource && utmSource.startsWith("an_")) {
      url.searchParams.set("utm_source", `an_${affiliateId.trim()}`);
      matched = true;
    }
    return matched ? url.toString() : urlStr;
  } catch {
    return urlStr;
  }
}

export function normalizeShopeeAffiliateUrl(url: string, config: ShopeeConfig): string {
  if (config.replaceAffiliateId) {
    return replaceShopeeAffiliateIdIfFullAffiliateUrl(url, config.affiliateId);
  }
  return url;
}

// 3. Map Lazada Sub IDs theo Source
export function mapLazadaSubIdsBySource(
  subIds: { subId1: string; subId2: string; subId3: string; subId4: string; subId5: string; subId6: string; },
  source: LazadaConfig["primarySource"] | LazadaConfig["fallbackSource"]
): { payload: Record<string, string>; warning?: string } {
  const sanitized: Record<string, string> = {
    subId1: (subIds.subId1 || "").trim().replace(/[^a-zA-Z0-9_]/g, ""),
    subId2: (subIds.subId2 || "").trim().replace(/[^a-zA-Z0-9_]/g, ""),
    subId3: (subIds.subId3 || "").trim().replace(/[^a-zA-Z0-9_]/g, ""),
    subId4: (subIds.subId4 || "").trim().replace(/[^a-zA-Z0-9_]/g, ""),
    subId5: (subIds.subId5 || "").trim().replace(/[^a-zA-Z0-9_]/g, ""),
    subId6: (subIds.subId6 || "").trim().replace(/[^a-zA-Z0-9_]/g, ""),
  };

  if (source === "lazada_api" || source === "web") {
    return { payload: sanitized };
  } else {
    // accesstrade
    const payload: Record<string, string> = {
      subId1: sanitized.subId1,
    };
    const hasExtra = sanitized.subId2 || sanitized.subId3 || sanitized.subId4 || sanitized.subId5 || sanitized.subId6;
    return {
      payload,
      warning: hasExtra ? "Nguồn AccessTrade chỉ hỗ trợ Sub ID 1." : undefined,
    };
  }
}

// 4. Map TikTok Tracking Payload
export function mapTikTokTrackingPayload(tracking: TikTokShopTracking): Record<string, string> {
  const result: Record<string, string> = {};
  const keys: Array<keyof TikTokShopTracking> = [
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "utmContent",
    "sub1",
    "sub2",
    "sub3",
    "sub4",
  ];
  keys.forEach((k) => {
    if (tracking[k]?.trim()) {
      result[k] = tracking[k].trim();
    }
  });
  return result;
}

// 5. Validation Platform Config
export function validatePlatformConfig(platform: "shopee" | "lazada" | "tiktok", config: any, testUrl?: string): string[] {
  const errors: string[] = [];

  if (platform === "shopee") {
    if (!config.enabled) return [];

    const validateSource = (source: string) => {
      if (source === "accesstrade") {
        if (!config.accessTradeToken?.trim()) errors.push("Thiếu AccessTrade token cho Shopee");
        if (!config.campaignId?.trim()) errors.push("Thiếu Campaign ID cho Shopee");
      }
      if (source === "affiliate_id") {
        if (!config.affiliateId?.trim()) errors.push("Thiếu Shopee affiliate_id");
      }
    };

    validateSource(config.primarySource);
    if (config.useFallback) {
      validateSource(config.fallbackSource);
    }

    if (config.replaceAffiliateId && !config.affiliateId?.trim()) {
      errors.push("Thiếu Shopee affiliate_id");
    }

    if (testUrl !== undefined) {
      if (!testUrl.trim()) {
        errors.push("URL test không được để trống");
      } else {
        try {
          const url = new URL(testUrl);
          if (!url.hostname.includes("shopee.vn") && !url.hostname.includes("shopee.co.id") && !url.hostname.includes("shopee.sg")) {
            errors.push("URL test không phải link Shopee hợp lệ");
          }
        } catch {
          errors.push("URL test không hợp lệ");
        }
      }
    }
  }

  if (platform === "lazada") {
    if (!config.enabled) return [];

    const validateSource = (source: string) => {
      if (source === "lazada_api") {
        if (!config.appKey?.trim()) errors.push("Thiếu Lazada App Key");
        if (!config.appSecret?.trim()) errors.push("Thiếu Lazada App Secret");
        if (!config.accessToken?.trim()) errors.push("Thiếu Lazada Access Token");
        if (!config.region?.trim()) errors.push("Thiếu Lazada Region");
      } else if (source === "accesstrade") {
        if (!config.accessTradeToken?.trim()) errors.push("Thiếu AccessTrade token cho Lazada");
        if (!config.campaignId?.trim()) errors.push("Thiếu Campaign ID cho Lazada");
      }
    };

    validateSource(config.primarySource);
    if (config.useFallback) {
      validateSource(config.fallbackSource);
    }

    if (testUrl !== undefined) {
      if (!testUrl.trim()) {
        errors.push("URL test không được để trống");
      } else {
        try {
          const url = new URL(testUrl);
          if (!url.hostname.includes("lazada.vn") && !url.hostname.includes("lazada.sg")) {
            errors.push("URL test không phải link Lazada hợp lệ");
          }
          if (url.hostname.startsWith("s.lazada.vn") && config.primarySource === "lazada_api") {
            errors.push("Không dùng link s.lazada.vn làm URL đầu vào nếu source yêu cầu link gốc");
          }
        } catch {
          errors.push("URL test không hợp lệ");
        }
      }
    }
  }

  if (platform === "tiktok") {
    if (!config.enabled) return [];
    if (!config.accessTradeToken?.trim()) {
      errors.push("Thiếu AccessTrade token cho TikTok Shop");
    }
    if (testUrl !== undefined) {
      if (!testUrl.trim()) {
        errors.push("URL test không được để trống");
      } else {
        try {
          const url = new URL(testUrl);
          if (!url.hostname.includes("tiktok.com")) {
            errors.push("URL test không phải link TikTok Shop hợp lệ");
          }
        } catch {
          errors.push("URL test không hợp lệ");
        }
      }
    }
  }

  return errors;
}

// 6. Map New platform config -> old backend payload (PUT)
export function toOldPayload(newConfig: NewAffiliateConfig, existingPayload: any = {}): any {
  const shopee = newConfig.shopee;
  const lazada = newConfig.lazada;
  const tiktokShop = newConfig.tiktokShop;

  // Lấy accessTradeToken / campaignId global từ shopee làm chính, fallback sang lazada, tiktokShop
  const accessTradeToken =
    shopee.accessTradeToken || lazada.accessTradeToken || tiktokShop.accessTradeToken || existingPayload.accessTradeToken || "";
  const accessTradeCampaignId =
    shopee.campaignId || lazada.campaignId || tiktokShop.campaignId || existingPayload.accessTradeCampaignId || "";

  const networks = [
    shopee.enabled ? "shopee" : "",
    lazada.enabled ? "lazada" : "",
    tiktokShop.enabled ? "tiktok_shop" : "",
  ].filter(Boolean);

  // Shopee mode map
  const shopeeMode = shopee.primarySource === "web"
    ? shopee.useFallback ? "auto" : "web"
    : shopee.primarySource === "accesstrade" ? "accesstrade" : "affiliate_id";

  // Lazada subId gộp để giữ tương thích ngược
  const defaultLazadaSet = lazada.subIdSets?.find((s: any) => s.isDefault) || lazada.subIdSets?.[0];
  const lazadaSubIdStr = defaultLazadaSet
    ? JSON.stringify({
        subId1: defaultLazadaSet.subId1,
        subId2: defaultLazadaSet.subId2,
        subId3: defaultLazadaSet.subId3,
        subId4: defaultLazadaSet.subId4,
        subId5: defaultLazadaSet.subId5,
        subId6: defaultLazadaSet.subId6,
      })
    : "{}";

  // TikTok subId gộp các UTM tracking
  const tiktokSubIdStr = JSON.stringify(tiktokShop.tracking);

  return {
    ...existingPayload,
    networks,
    unknownLinkAction: newConfig.unknownLinkAction,
    accessTradeToken,
    accessTradeCampaignId,
    shopeeMode,
    shopeeAffiliateId: shopee.affiliateId || "",
    
    // Lazada global values (vẫn cần thiết)
    lazadaKey: lazada.appKey || "",
    lazadaSecret: lazada.appSecret || "",
    lazadaToken: lazada.accessToken || "",
    lazadaRegion: lazada.region || "VN",

    // platform specific configs
    shopee: {
      enabled: shopee.enabled,
      primary: shopee.primarySource,
      fallbackEnabled: shopee.useFallback,
      fallback: shopee.fallbackSource,
      affiliateId: shopee.affiliateId || "",
      campaignId: shopee.campaignId || "",
      subId: buildShopeeSubId(shopee.subIds),
      // Mở rộng thêm để giữ nguyên trạng thái mới khi GET
      accessTradeToken: shopee.accessTradeToken,
      subIds: shopee.subIds,
      primarySource: shopee.primarySource,
      fallbackSource: shopee.fallbackSource,
      useFallback: shopee.useFallback,
      replaceAffiliateId: shopee.replaceAffiliateId,
      outputType: shopee.outputType,
    },
    lazada: {
      enabled: lazada.enabled,
      primary: lazada.primarySource,
      fallbackEnabled: lazada.useFallback,
      fallback: lazada.fallbackSource,
      campaignId: lazada.campaignId || "",
      subId: lazadaSubIdStr,
      // Mở rộng thêm
      accessTradeToken: lazada.accessTradeToken,
      appKey: lazada.appKey,
      appSecret: lazada.appSecret,
      accessToken: lazada.accessToken,
      region: lazada.region,
      subIdSets: lazada.subIdSets || [],
      primarySource: lazada.primarySource,
      fallbackSource: lazada.fallbackSource,
      useFallback: lazada.useFallback,
    },
    tiktok: {
      enabled: tiktokShop.enabled,
      primary: "accesstrade",
      fallbackEnabled: false,
      fallback: "accesstrade",
      campaignId: tiktokShop.campaignId || "",
      subId: tiktokSubIdStr,
      // Mở rộng thêm
      accessTradeToken: tiktokShop.accessTradeToken,
      tracking: tiktokShop.tracking,
    },
  };
}

// 7. Map Old payload -> New platform config (GET)
export function fromOldPayload(oldPayload: any): NewAffiliateConfig {
  const accessTradeToken = oldPayload?.accessTradeToken || "";
  const accessTradeCampaignId = oldPayload?.accessTradeCampaignId || "";

  // Shopee
  const shopee = oldPayload?.shopee || {};
  let shopeeSubIds: ShopeeSubIds = {
    subId1: "",
    subId2: "",
    subId3: "",
    subId4: "",
    subId5: "",
  };
  if (shopee.subIds) {
    shopeeSubIds = { ...shopeeSubIds, ...shopee.subIds };
  } else if (shopee.subId) {
    // Split subId bằng dấu -
    const parts = shopee.subId.split("-");
    shopeeSubIds = {
      subId1: parts[0] || "",
      subId2: parts[1] || "",
      subId3: parts[2] || "",
      subId4: parts[3] || "",
      subId5: parts[4] || "",
    };
  }

  // Lazada
  const lazada = oldPayload?.lazada || {};
  let subIdSets: LazadaSubIdSet[] = [];
  
  if (lazada.subIdSets && Array.isArray(lazada.subIdSets)) {
    subIdSets = lazada.subIdSets;
  } else {
    // Convert old subIds
    let lazadaSubIds = {
      subId1: "",
      subId2: "",
      subId3: "",
      subId4: "",
      subId5: "",
      subId6: "",
    };
    if (lazada.subIds) {
      lazadaSubIds = { ...lazadaSubIds, ...lazada.subIds };
    } else if (lazada.subId) {
      try {
        if (lazada.subId.startsWith("{") && lazada.subId.endsWith("}")) {
          const parsed = JSON.parse(lazada.subId);
          lazadaSubIds = { ...lazadaSubIds, ...parsed };
        } else {
          lazadaSubIds.subId1 = lazada.subId;
        }
      } catch {
        lazadaSubIds.subId1 = lazada.subId;
      }
    }
    
    subIdSets = [
      {
        id: "default",
        name: "Mặc định",
        subId1: lazadaSubIds.subId1,
        subId2: lazadaSubIds.subId2,
        subId3: lazadaSubIds.subId3,
        subId4: lazadaSubIds.subId4,
        subId5: lazadaSubIds.subId5,
        subId6: lazadaSubIds.subId6,
        isDefault: true,
        subIdKey: "",
      }
    ];
  }

  // TikTok
  const tiktok = oldPayload?.tiktok || {};
  let tiktokTracking: TikTokShopTracking = {
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    utmContent: "",
    sub1: "",
    sub2: "",
    sub3: "",
    sub4: "",
  };
  if (tiktok.tracking) {
    tiktokTracking = { ...tiktokTracking, ...tiktok.tracking };
  } else if (tiktok.subId) {
    try {
      if (tiktok.subId.startsWith("{") && tiktok.subId.endsWith("}")) {
        const parsed = JSON.parse(tiktok.subId);
        tiktokTracking = { ...tiktokTracking, ...parsed };
      } else {
        tiktokTracking.sub1 = tiktok.subId;
      }
    } catch {
      tiktokTracking.sub1 = tiktok.subId;
    }
  }

  return {
    shopee: {
      enabled: shopee.enabled ?? true,
      primarySource: shopee.primarySource || shopee.primary || "web",
      useFallback: shopee.useFallback ?? shopee.fallbackEnabled ?? true,
      fallbackSource: shopee.fallbackSource || shopee.fallback || "accesstrade",
      accessTradeToken: shopee.accessTradeToken || accessTradeToken,
      campaignId: shopee.campaignId || accessTradeCampaignId,
      affiliateId: shopee.affiliateId || oldPayload?.shopeeAffiliateId || "",
      replaceAffiliateId: shopee.replaceAffiliateId ?? !!(shopee.affiliateId || oldPayload?.shopeeAffiliateId),
      outputType: shopee.outputType || "shortlink",
      subIds: shopeeSubIds,
      testUrl: "https://shopee.vn/san-pham-mau?affiliate_id=old_id",
    },
    lazada: {
      enabled: lazada.enabled ?? true,
      primarySource: lazada.primarySource || lazada.primary || "api",
      useFallback: lazada.useFallback ?? lazada.fallbackEnabled ?? true,
      fallbackSource: lazada.fallbackSource || lazada.fallback || "accesstrade",
      appKey: lazada.appKey || oldPayload?.lazadaKey || "",
      appSecret: lazada.appSecret || oldPayload?.lazadaSecret || "",
      accessToken: lazada.accessToken || oldPayload?.lazadaToken || "",
      region: lazada.region || oldPayload?.lazadaRegion || "VN",
      accessTradeToken: lazada.accessTradeToken || accessTradeToken,
      campaignId: lazada.campaignId || accessTradeCampaignId,
      subIdSets,
      testUrl: "https://www.lazada.vn/products/san-pham-mau.html",
    },
    tiktokShop: {
      enabled: tiktok.enabled ?? false,
      source: "accesstrade",
      accessTradeToken: tiktok.accessTradeToken || accessTradeToken,
      campaignId: tiktok.campaignId || accessTradeCampaignId,
      tracking: tiktokTracking,
      testUrl: "https://www.tiktok.com/shop/pdp/san-pham-mau",
    },
    unknownLinkAction: oldPayload?.unknownLinkAction || "saved_for_review",
  };
}

// 8. Test Platform Conversion
export async function testPlatformConversion(
  platform: "shopee" | "lazada" | "tiktok",
  config: any,
  testUrl: string
): Promise<any> {
  return apiPost<{ success: boolean; converted: string | null; error?: string }>("/settings/affiliate/test-conversion", {
    platform,
    config,
    testUrl,
  });
}
