import { normalizeAffiliateCategories, type AffiliateCategory, type LinkNetwork } from "@zerun/shared";

/**
 * SourceProfile — cấu hình theo từng nguồn (group/channel) để rule engine và AI
 * biết kỳ vọng nội dung và mức độ tin cậy. Lưu kèm trong `SourceAccount.config`
 * hoặc một bảng riêng sau này; ở đây là kiểu + default.
 */
export type SourceTrustLevel = "high" | "medium" | "low";

export type SourceProfile = {
  id: string;
  type: string; // vd "voucher_deal_group"
  mainPlatforms: LinkNetwork[];
  enabledCategories: AffiliateCategory[];
  trustLevel: SourceTrustLevel;
  /** Cho phép auto publish khi rule nội bộ xác định nội dung an toàn. */
  allowAutoPublish: boolean;
};

export const DEFAULT_SOURCE_PROFILE: SourceProfile = {
  id: "default",
  type: "unknown",
  mainPlatforms: [],
  enabledCategories: [],
  trustLevel: "low",
  allowAutoPublish: false
};

/** Đọc SourceProfile từ `SourceAccount.config` (Json), fallback default. */
export function readSourceProfile(config: unknown, id = "default"): SourceProfile {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { ...DEFAULT_SOURCE_PROFILE, id };
  }
  const raw = (config as Record<string, unknown>).sourceProfile;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SOURCE_PROFILE, id };
  const p = raw as Partial<SourceProfile>;
  return {
    id: p.id ?? id,
    type: p.type ?? DEFAULT_SOURCE_PROFILE.type,
    mainPlatforms: Array.isArray(p.mainPlatforms) ? p.mainPlatforms : [],
    enabledCategories: normalizeAffiliateCategories(
      p.enabledCategories ?? (config as Record<string, unknown>).enabledCategories
    ),
    trustLevel: p.trustLevel ?? DEFAULT_SOURCE_PROFILE.trustLevel,
    allowAutoPublish: p.allowAutoPublish ?? DEFAULT_SOURCE_PROFILE.allowAutoPublish
  };
}
