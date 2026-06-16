import type { LinkNetwork } from "@zerun/shared";
import { detectLinks, detectLinkRole, type LinkRole } from "../links/detect.js";
import { matchGlossary } from "../rules/glossary.js";
import type { SourceProfile } from "../rules/source-profile.js";

/**
 * Payload ngắn gửi cho AI mỗi call. Cố tình tối giản: rule engine đã làm phần
 * chắc chắn, AI chỉ xử lý phần khó. Khớp "AI context" trong tài liệu.
 */
export type AiContextLink = {
  url: string;
  network: LinkNetwork;
  roleGuess: LinkRole;
};

export type AiContext = {
  sourceProfile: Pick<SourceProfile, "id" | "type" | "mainPlatforms" | "trustLevel">;
  message: {
    text: string;
    isReply: boolean;
    hasImage: boolean;
  };
  extracted: {
    links: AiContextLink[];
    discounts: string[];
    matchedGlossary: Record<string, string>;
  };
  nearbyMessages: string[];
};

const discountPattern = /\b\d{1,3}\s?%|\b\d{1,3}k\b|\bgiảm\s?\d+/gi;

export type BuildContextInput = {
  text: string;
  sourceProfile: SourceProfile;
  isReply?: boolean;
  hasImage?: boolean;
  nearbyMessages?: string[];
};

export function buildAiContext(input: BuildContextInput): AiContext {
  const { text, sourceProfile } = input;
  const links: AiContextLink[] = detectLinks(text).map((link) => ({
    url: link.url,
    network: link.network,
    roleGuess: detectLinkRole(link.url)
  }));

  const discounts = Array.from(text.matchAll(discountPattern), (m) => m[0].trim());

  return {
    sourceProfile: {
      id: sourceProfile.id,
      type: sourceProfile.type,
      mainPlatforms: sourceProfile.mainPlatforms,
      trustLevel: sourceProfile.trustLevel
    },
    message: {
      text,
      isReply: input.isReply ?? false,
      hasImage: input.hasImage ?? false
    },
    extracted: {
      links,
      discounts: Array.from(new Set(discounts)),
      matchedGlossary: matchGlossary(text)
    },
    nearbyMessages: input.nearbyMessages ?? []
  };
}
