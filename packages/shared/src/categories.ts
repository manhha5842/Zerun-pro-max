export const affiliateCategories = [
  "Thời Trang Nam",
  "Thời Trang Nữ",
  "Điện Thoại & Phụ Kiện",
  "Thiết Bị Điện Tử",
  "Máy Tính & Laptop",
  "Máy Ảnh & Máy Quay Phim",
  "Đồng Hồ",
  "Giày Dép Nam",
  "Giày Dép Nữ",
  "Túi Ví Nam",
  "Túi Ví Nữ",
  "Thiết Bị Điện Gia Dụng",
  "Nhà Cửa & Đời Sống",
  "Mẹ & Bé",
  "Sức Khỏe & Sắc Đẹp",
  "Thể Thao & Du Lịch",
  "Ô Tô & Xe Máy & Xe Đạp",
  "Bách Hóa Online",
  "Nhà Sách Online",
  "Balo & Túi Ví",
  "Phụ Kiện Thời Trang",
  "Đồ Chơi & Game",
  "Voucher & Dịch Vụ",
  "Thú Cưng",
  "Nội Thất & Trang Trí Nhà",
  "Dụng Cụ & Thiết Bị Tiện Ích",
  "Thực Phẩm & Đồ Uống",
  "Chăm Sóc Nhà Cửa"
] as const;

export type AffiliateCategory = (typeof affiliateCategories)[number];

export const CATEGORY_CONFIDENCE_REVIEW_THRESHOLD = 0.75;

const affiliateCategorySet = new Set<string>(affiliateCategories);

export function isAffiliateCategory(value: unknown): value is AffiliateCategory {
  return typeof value === "string" && affiliateCategorySet.has(value);
}

export function normalizeAffiliateCategories(value: unknown): AffiliateCategory[] {
  const rawItems = readCategoryItems(value);
  const unique = new Set<AffiliateCategory>();
  for (const item of rawItems) {
    const trimmed = item.trim();
    if (isAffiliateCategory(trimmed)) unique.add(trimmed);
  }
  return Array.from(unique);
}

export function readAccountCategories(config: unknown, key: "enabledCategories" | "acceptedCategories"): AffiliateCategory[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  return normalizeAffiliateCategories((config as Record<string, unknown>)[key]);
}

export function targetMatchesCategories(analysisCategories: readonly string[], acceptedCategories: readonly string[]): boolean {
  if (acceptedCategories.length === 0) return true;
  if (analysisCategories.length === 0) return true;
  const accepted = new Set(acceptedCategories);
  return analysisCategories.some((category) => accepted.has(category));
}

export function sourceAllowsCategories(analysisCategories: readonly string[], enabledCategories: readonly string[]): boolean {
  if (enabledCategories.length === 0) return true;
  if (analysisCategories.length === 0) return true;
  const enabled = new Set(enabledCategories);
  return analysisCategories.some((category) => enabled.has(category));
}

function readCategoryItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Allow comma-separated values in forms and env-like inputs.
  }

  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}
