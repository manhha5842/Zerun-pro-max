export type AccountKind = "source" | "target";

export type RepostAccount = {
  id: string;
  kind?: AccountKind;
  name: string;
  platform: string;
  handle?: string | null;
  health: string;
  isActive: boolean;
  config?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type RoutingRule = {
  id: string;
  sourceId: string;
  targetId: string;
  autoPublish: boolean;
  useAI: boolean;
  requireReview: boolean;
  isActive: boolean;
  source?: RepostAccount;
  target?: RepostAccount;
};

export type ConnectedAccount = {
  id: string;
  accountKind: AccountKind;
  platform: string;
  name: string;
  handle?: string | null;
  health: string;
  isActive: boolean;
  lastCrawledAt?: string | null;
  linkedSourceAccountId?: string | null;
};

export type PlatformChannel = {
  id: string;
  accountKind: AccountKind;
  accountId: string;
  platform: string;
  externalId: string;
  name: string;
  channelType: string;
  isSource: boolean;
  isTarget: boolean;
  filterMode: "all" | "category";
  acceptedCategories: string[];
  allowGeneralContent: boolean;
  isActive: boolean;
  metadata?: Record<string, unknown> | null;
  account?: ConnectedAccount | null;
};

export type RepostFlow = {
  id: string;
  name: string;
  description?: string | null;
  useAI: boolean;
  autoPublish: boolean;
  requireReview: boolean;
  isActive: boolean;
  sources: Array<{ channelId: string; channel: PlatformChannel }>;
  targets: Array<{ channelId: string; channel: PlatformChannel }>;
};

export type RepostContent = {
  id: string;
  code: string;
  platform: string;
  sourceId?: string | null;
  originalText: string;
  draftText?: string | null;
  finalText?: string | null;
  status: string;
  scheduledTargets?: string[] | null;
  savedReason?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: RepostAccount | null;
  lastError?: string | null;
  links?: Array<{
    id: string;
    originalUrl: string;
    convertedUrl?: string | null;
    network: string;
    status: string;
    error?: string | null;
  }>;
  media?: Array<{
    id: string;
    type?: string | null;
    mimeType?: string | null;
    sourceUrl?: string | null;
    localPath?: string | null;
    cdnUrl?: string | null;
  }>;
  publishAttempts?: Array<{
    id: string;
    status: string;
    resultUrl?: string | null;
    error?: string | null;
    createdAt: string;
    targetId?: string;
    targetChannelId?: string | null;
    target?: { id: string; name: string; platform: string };
  }>;
  createdAt: string;
  updatedAt: string;
};

export type ContentPackageMetadata = {
  rawMessageIds: string[];
  status?: string;
  confidence?: number;
  productCount?: number;
  groupingReason?: string;
  linkCount?: number;
  mediaCount?: number;
  rawMessages?: Array<{
    id: string;
    externalId?: string;
    senderId?: string | null;
    senderName?: string | null;
    text?: string;
    mediaCount?: number;
    links?: string[];
    createdAt?: string;
  }>;
};

export type ContentLink = {
  id: string;
  contentId: string;
  originalUrl: string;
  convertedUrl?: string | null;
  network: string;
  status: string;
  error?: string | null;
  content: RepostContent;
  createdAt: string;
  updatedAt: string;
};

export type RepostSourceHistoryItem = {
  id: string;
  code: string;
  platform: string;
  sourceId?: string | null;
  sourceName?: string | null;
  sourceChannelId?: string | null;
  sourceChannelName?: string | null;
  sourceChannelExternalId?: string | null;
  author?: string | null;
  originalText: string;
  draftText?: string | null;
  finalText?: string | null;
  status: string;
  savedReason?: string | null;
  lastError?: string | null;
  postedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  package: {
    rawMessageCount: number;
    rawMessageIds: string[];
    status?: string | null;
    confidence?: number | null;
    productCount?: number | null;
    groupingReason?: string | null;
    linkCount: number;
    mediaCount: number;
    rawMessages?: Array<{
      id: string;
      externalId?: string;
      senderId?: string | null;
      senderName?: string | null;
      text?: string;
      mediaCount?: number;
      links?: string[];
      createdAt?: string;
    }>;
  };
  decision: {
    primaryCategory?: unknown;
    categoryConfidence?: unknown;
    reason?: unknown;
    matchedTargetCount: number;
    wouldPublishTargetCount: number;
  };
  media: Array<{
    id: string;
    type?: string | null;
    mimeType?: string | null;
    sourceUrl?: string | null;
    localPath?: string | null;
    cloudinaryUrl?: string | null;
  }>;
  links: Array<{
    id: string;
    originalUrl: string;
    convertedUrl?: string | null;
    network: string;
    status: string;
    error?: string | null;
  }>;
  publishAttempts: Array<{
    id: string;
    status: string;
    targetName?: string | null;
    resultUrl?: string | null;
    error?: string | null;
    createdAt?: string | null;
    completedAt?: string | null;
  }>;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    telegram: "Telegram",
    "zalo-personal": "Zalo cá nhân",
    facebook: "Facebook",
    instagram: "Instagram",
    threads: "Threads",
    x: "X / Twitter"
  };
  return labels[platform] ?? platform;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("vi-VN");
}

export function readReviewMetadata(content: Pick<RepostContent, "metadata">) {
  const metadata = content.metadata && typeof content.metadata === "object" && !Array.isArray(content.metadata)
    ? content.metadata
    : {};
  const review = metadata.review && typeof metadata.review === "object" && !Array.isArray(metadata.review)
    ? metadata.review as Record<string, unknown>
    : {};
  const analysis = metadata.ai && typeof metadata.ai === "object" && !Array.isArray(metadata.ai)
    ? (metadata.ai as Record<string, unknown>).analysis
    : null;
  const contentPackage = metadata.contentPackage && typeof metadata.contentPackage === "object" && !Array.isArray(metadata.contentPackage)
    ? metadata.contentPackage as ContentPackageMetadata
    : null;
  return {
    review,
    contentPackage,
    analysis: analysis && typeof analysis === "object" && !Array.isArray(analysis)
      ? analysis as Record<string, unknown>
      : {}
  };
}
