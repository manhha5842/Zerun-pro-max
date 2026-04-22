import type { DetectedLink, HealthStatus, LinkNetwork, Platform } from "@zerun/shared";

export type AdapterAccount = {
  id: string;
  platform: Platform;
  name: string;
  handle?: string | null;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
};

export type RawMedia = {
  type: "image" | "video" | "document";
  url?: string;
  localPath?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

export type RawSourceItem = {
  platform: Platform;
  sourceId: string;
  externalId: string;
  author?: string;
  text: string;
  media: RawMedia[];
  originalUrl?: string;
  postedAt?: Date;
  metadata?: Record<string, unknown>;
};

export type CrawlInput = {
  account: AdapterAccount;
  limit?: number;
  since?: Date;
};

export type CrawlResult = {
  items: RawSourceItem[];
  cursor?: string;
};

export type PublishInput = {
  account: AdapterAccount;
  contentId: string;
  text: string;
  media: RawMedia[];
};

export type PublishResult = {
  externalId?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

export type AdapterHealth = {
  status: HealthStatus;
  message?: string;
  metadata?: Record<string, unknown>;
};

export interface SourceAdapter {
  platform: Platform;
  testConnection(account: AdapterAccount): Promise<AdapterHealth>;
  crawl(input: CrawlInput): Promise<CrawlResult>;
}

export type CommentInput = {
  account: AdapterAccount;
  postUrl: string;
  text: string;
  media?: RawMedia[];
};

export type CommentResult = {
  url?: string;
  metadata?: Record<string, unknown>;
};

export interface PublishAdapter {
  platform: Platform;
  testConnection(account: AdapterAccount): Promise<AdapterHealth>;
  publish(input: PublishInput): Promise<PublishResult>;
  comment?(input: CommentInput): Promise<CommentResult>;
}

export type ConvertLinkInput = {
  url: string;
  network: LinkNetwork;
  campaignId?: string;
  subId?: string;
};

export type ConvertLinkResult = {
  original: string;
  converted: string | null;
  network: LinkNetwork;
  success: boolean;
  error?: string;
};

export interface AffiliateAdapter {
  detect(text: string): DetectedLink[];
  convert(input: ConvertLinkInput): Promise<ConvertLinkResult>;
}
