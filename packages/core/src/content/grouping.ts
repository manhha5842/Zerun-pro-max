export type RawMessageMedia = {
  type: string;
  url?: string;
  localPath?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

export type RawMessageForGrouping = {
  id: string;
  platform: string;
  sourceId: string;
  sourceChannelId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  text: string;
  media: RawMessageMedia[];
  links?: string[];
  replyToMessageId?: string | null;
  mediaGroupId?: string | null;
  createdAt: Date;
  originalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ContentPackageStatus =
  | "buffering"
  | "ready_to_review"
  | "auto_approved"
  | "needs_review"
  | "converted"
  | "posted"
  | "failed"
  | "skipped";

export type ContentPackage = {
  id: string;
  platform: string;
  sourceId: string;
  sourceChannelId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  rawMessageIds: string[];
  groupedText: string;
  media: RawMessageMedia[];
  links: string[];
  mediaGroupId?: string | null;
  status: ContentPackageStatus;
  confidence: number;
  productCount: number;
  groupingReason: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageGroupingOptions = {
  sameSenderWindowMs?: number;
};

const DEFAULT_SAME_SENDER_WINDOW_MS = 120_000;

export function groupRawMessagesIntoPackages(
  messages: RawMessageForGrouping[],
  options: MessageGroupingOptions = {}
) {
  const sameSenderWindowMs = options.sameSenderWindowMs ?? DEFAULT_SAME_SENDER_WINDOW_MS;
  const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const packages: ContentPackage[] = [];

  for (const message of sorted) {
    const links = linksOf(message);
    const replyPackage = message.replyToMessageId
      ? packages.find((item) => item.rawMessageIds.includes(String(message.replyToMessageId)))
      : null;
    const albumPackage = message.mediaGroupId
      ? packages.find((item) => item.mediaGroupId === message.mediaGroupId && sameSource(item, message))
      : null;
    const senderPackage = findRecentSenderPackage(packages, message, sameSenderWindowMs);
    const candidate = replyPackage ?? albumPackage ?? senderPackage;

    if (!candidate) {
      packages.push(createPackage(message, links, "Bắt đầu content package mới"));
      continue;
    }

    if (startsNewProduct(candidate, message, links)) {
      packages.push(createPackage(message, links, "Tách package vì có dấu hiệu sản phẩm mới hoặc link khác"));
      continue;
    }

    appendToPackage(candidate, message, links, candidate.mediaGroupId ? "Gom theo album/mediaGroupId" : "Gom theo cùng sender trong cửa sổ thời gian");
  }

  return packages.map(finalizePackage);
}

function createPackage(message: RawMessageForGrouping, links: string[], groupingReason: string): ContentPackage {
  return {
    id: `pkg-${message.id}`,
    platform: message.platform,
    sourceId: message.sourceId,
    sourceChannelId: message.sourceChannelId,
    senderId: message.senderId,
    senderName: message.senderName,
    rawMessageIds: [message.id],
    groupedText: message.text.trim(),
    media: [...message.media],
    links,
    mediaGroupId: message.mediaGroupId,
    status: "ready_to_review",
    confidence: initialConfidence(message, links),
    productCount: Math.max(links.length, 0),
    groupingReason,
    createdAt: message.createdAt,
    updatedAt: message.createdAt
  };
}

function appendToPackage(contentPackage: ContentPackage, message: RawMessageForGrouping, links: string[], groupingReason: string) {
  contentPackage.rawMessageIds.push(message.id);
  if (message.text.trim()) {
    contentPackage.groupedText = [contentPackage.groupedText, message.text.trim()].filter(Boolean).join("\n");
  }
  contentPackage.media.push(...message.media);
  contentPackage.links = uniqueStrings([...contentPackage.links, ...links]);
  contentPackage.productCount = Math.max(contentPackage.productCount, contentPackage.links.length);
  contentPackage.updatedAt = message.createdAt;
  contentPackage.groupingReason = contentPackage.groupingReason.includes("Bắt đầu")
    ? groupingReason
    : uniqueStrings([...contentPackage.groupingReason.split(" · "), groupingReason]).join(" · ");
}

function finalizePackage(contentPackage: ContentPackage) {
  const hasLink = contentPackage.links.length > 0;
  const hasMedia = contentPackage.media.length > 0;
  const hasText = contentPackage.groupedText.trim().length > 0;
  const hasManyProducts = contentPackage.productCount > 1;
  const confidence = Math.min(100, Math.max(contentPackage.confidence, scorePackage({ hasLink, hasMedia, hasText, hasManyProducts })));
  return {
    ...contentPackage,
    confidence,
    status: confidence >= 85 && hasLink && !hasManyProducts ? "auto_approved" as const : "needs_review" as const
  };
}

function findRecentSenderPackage(packages: ContentPackage[], message: RawMessageForGrouping, sameSenderWindowMs: number) {
  const senderId = message.senderId ?? "";
  if (!senderId) return null;
  for (let index = packages.length - 1; index >= 0; index -= 1) {
    const contentPackage = packages[index];
    if (!sameSource(contentPackage, message)) continue;
    if ((contentPackage.senderId ?? "") !== senderId) continue;
    const distance = Math.abs(message.createdAt.getTime() - contentPackage.updatedAt.getTime());
    if (distance <= sameSenderWindowMs) return contentPackage;
  }
  return null;
}

function sameSource(contentPackage: ContentPackage, message: RawMessageForGrouping) {
  return contentPackage.platform === message.platform
    && contentPackage.sourceId === message.sourceId
    && (contentPackage.sourceChannelId ?? null) === (message.sourceChannelId ?? null);
}

function startsNewProduct(contentPackage: ContentPackage, message: RawMessageForGrouping, messageLinks: string[]) {
  if (messageLinks.length === 0 || contentPackage.links.length === 0) return false;
  const currentLinks = new Set(contentPackage.links.map(normalizeProductLink));
  const nextLinks = messageLinks.map(normalizeProductLink);
  const hasSharedLink = nextLinks.some((link) => currentLinks.has(link));
  if (hasSharedLink) return false;

  return true;
}

function linksOf(message: RawMessageForGrouping) {
  return uniqueStrings([
    ...(message.links ?? []),
    ...(message.originalUrl ? [message.originalUrl] : []),
    ...extractLinks(message.text)
  ].map((link) => link.trim()).filter(Boolean));
}

function extractLinks(text: string) {
  return text.match(/https?:\/\/\S+/g) ?? [];
}

function normalizeProductLink(link: string) {
  try {
    const url = new URL(link);
    url.hash = "";
    url.search = "";
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return link.trim().toLowerCase();
  }
}

function initialConfidence(message: RawMessageForGrouping, links: string[]) {
  let score = 45;
  if (message.mediaGroupId) score += 25;
  if (message.replyToMessageId) score += 15;
  if (links.length === 1) score += 15;
  if (message.media.length > 0) score += 10;
  if (message.text.trim()) score += 10;
  return Math.min(score, 100);
}

function scorePackage(input: { hasLink: boolean; hasMedia: boolean; hasText: boolean; hasManyProducts: boolean }) {
  let score = 45;
  if (input.hasText) score += 15;
  if (input.hasMedia) score += 15;
  if (input.hasLink) score += 20;
  if (input.hasManyProducts) score -= 25;
  return score;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
