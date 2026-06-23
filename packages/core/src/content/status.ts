import type { ContentStatus } from "@zerun/shared";

export type ContentTransitionInput = {
  hasRoutingTargets: boolean;
  requiresManualReview: boolean;
  hasUnsupportedLinks: boolean;
  scheduledAt?: Date | string | null;
};

export function nextProcessedStatus(input: ContentTransitionInput): ContentStatus {
  if (input.scheduledAt) return "scheduled";
  if (!input.hasRoutingTargets) return "waiting_manual_convert";
  if (input.hasUnsupportedLinks) return "waiting_manual_convert";
  return "ready_to_publish";
}

export function isTerminalStatus(status: ContentStatus): boolean {
  return ["published", "failed", "skipped", "rejected"].includes(status);
}
