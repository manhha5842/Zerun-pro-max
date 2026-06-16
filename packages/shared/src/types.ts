export const platforms = ["telegram", "x", "threads", "instagram", "facebook", "zalo-personal"] as const;
export type Platform = (typeof platforms)[number];

export const accountKinds = ["source", "target"] as const;
export type AccountKind = (typeof accountKinds)[number];

export const contentStatuses = [
  "discovered",
  "processing",
  "waiting_link_convert",
  "waiting_manual_convert",
  "ready_to_publish",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "skipped",
  "rejected",
  "duplicate"
] as const;
export type ContentStatus = (typeof contentStatuses)[number];

export const healthStatuses = ["unknown", "healthy", "degraded", "checkpoint", "paused", "failed"] as const;
export type HealthStatus = (typeof healthStatuses)[number];

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  pagination?: Pagination;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type LinkNetwork = "shopee" | "lazada" | "tiki" | "sendo" | "tiktok_shop" | "unknown";

export type DetectedLink = {
  url: string;
  network: LinkNetwork;
  supported: boolean;
  position: {
    start: number;
    end: number;
  };
};
