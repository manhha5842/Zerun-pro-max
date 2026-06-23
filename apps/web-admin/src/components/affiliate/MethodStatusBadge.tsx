import { Badge } from "../ui/Badge";

export type MethodStatus = "not_configured" | "configured" | "test_passed" | "test_failed" | "coming_soon";

const labels: Record<MethodStatus, string> = {
  not_configured: "Chưa cấu hình",
  configured: "Đã cấu hình",
  test_passed: "Test thành công",
  test_failed: "Test thất bại",
  coming_soon: "Sắp hỗ trợ"
};

export function MethodStatusBadge({ status }: { status: MethodStatus }) {
  const tone = status === "test_passed" || status === "configured"
    ? "good"
    : status === "test_failed"
      ? "danger"
      : status === "coming_soon"
        ? "neutral"
        : "warn";

  return <Badge tone={tone}>{labels[status]}</Badge>;
}
