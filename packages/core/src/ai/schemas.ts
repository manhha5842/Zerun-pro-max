import { z } from "zod";
import { affiliateCategories } from "@zerun/shared";

/**
 * Schema JSON cố định AI phải trả về. Validate bằng Zod; nếu invalid → retry ở worker.
 * Khớp với DealAnalysis trong tài liệu kiến trúc.
 */
export const linkRoleSchema = z.enum([
  "product_link",
  "campaign_link",
  "review_link",
  "tutorial_link",
  "group_link",
  "cashback_link",
  "unknown"
]);

export const messageTypeSchema = z.enum([
  "product_deal",
  "voucher_code",
  "campaign_list",
  "instruction",
  "review_only",
  "comment",
  "spam",
  "unknown"
]);

export const dealPlatformSchema = z.enum([
  "shopee",
  "lazada",
  "tiki",
  "sendo",
  "tiktok_shop",
  "mixed",
  "unknown"
]);

export const affiliateCategorySchema = z.enum(affiliateCategories);

export const dealLinkSchema = z.object({
  url: z.string(),
  role: linkRoleSchema,
  shouldConvert: z.boolean(),
  shouldKeep: z.boolean(),
  reason: z.string().optional()
});

export const imageDecisionSchema = z.object({
  shouldKeepImage: z.boolean(),
  needVisionCheck: z.boolean(),
  reason: z.string().optional()
});

export const dealAnalysisSchema = z.object({
  shouldSave: z.boolean(),
  shouldPublish: z.boolean(),
  requireReview: z.boolean(),
  messageType: messageTypeSchema,
  primaryCategory: affiliateCategorySchema,
  secondaryCategories: z.array(affiliateCategorySchema),
  categoryConfidence: z.number().min(0).max(1),
  categoryReason: z.string(),
  platform: dealPlatformSchema,
  productName: z.string().optional(),
  shortTitle: z.string().optional(),
  price: z.string().optional(),
  discount: z.string().optional(),
  voucherCode: z.string().optional(),
  dealTime: z.string().optional(),
  links: z.array(dealLinkSchema),
  imageDecision: imageDecisionSchema,
  rewrittenText: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1)
});

export type DealAnalysis = z.infer<typeof dealAnalysisSchema>;
export type DealLink = z.infer<typeof dealLinkSchema>;

/** JSON Schema để dùng với OpenAI Structured Outputs / response_format. */
export const dealAnalysisJsonSchema = z.toJSONSchema(dealAnalysisSchema);
