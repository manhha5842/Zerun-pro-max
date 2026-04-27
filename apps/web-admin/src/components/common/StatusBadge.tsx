import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Pause, XCircle } from "lucide-react";
import { Badge } from "../ui/Badge";

const statusConfig: Record<string, { label: string; tone: "good" | "warn" | "danger" | "neutral"; icon?: ReactNode }> = {
  healthy: { label: "Khỏe", tone: "good", icon: <CheckCircle2 size={12} /> },
  active: { label: "Đang bật", tone: "good", icon: <CheckCircle2 size={12} /> },
  completed: { label: "Hoàn tất", tone: "good", icon: <CheckCircle2 size={12} /> },
  published: { label: "Đã đăng", tone: "good", icon: <CheckCircle2 size={12} /> },
  success: { label: "Thành công", tone: "good", icon: <CheckCircle2 size={12} /> },
  ready_to_publish: { label: "Sẵn sàng đăng", tone: "good", icon: <CheckCircle2 size={12} /> },
  degraded: { label: "Cần chú ý", tone: "warn", icon: <AlertTriangle size={12} /> },
  checkpoint: { label: "Checkpoint", tone: "warn", icon: <Clock size={12} /> },
  login_required: { label: "Cần đăng nhập", tone: "warn", icon: <Clock size={12} /> },
  scheduled: { label: "Đã lên lịch", tone: "neutral", icon: <Clock size={12} /> },
  draft: { label: "Nháp", tone: "neutral" },
  pending: { label: "Đang chờ", tone: "neutral", icon: <Clock size={12} /> },
  queued: { label: "Đã vào hàng đợi", tone: "neutral", icon: <Clock size={12} /> },
  running: { label: "Đang chạy", tone: "neutral", icon: <Clock size={12} /> },
  publishing: { label: "Đang đăng", tone: "neutral", icon: <Clock size={12} /> },
  new_detected: { label: "Mới phát hiện", tone: "neutral", icon: <Clock size={12} /> },
  fetching_media: { label: "Đang tải media", tone: "neutral", icon: <Clock size={12} /> },
  processing_content: { label: "Đang xử lý content", tone: "neutral", icon: <Clock size={12} /> },
  converting_links: { label: "Đang convert link", tone: "neutral", icon: <Clock size={12} /> },
  waiting_ai: { label: "Chờ AI", tone: "neutral", icon: <Clock size={12} /> },
  saved_for_review: { label: "Lưu để duyệt", tone: "warn", icon: <Pause size={12} /> },
  saved: { label: "Đã lưu", tone: "warn", icon: <Pause size={12} /> },
  paused: { label: "Tạm dừng", tone: "warn", icon: <Pause size={12} /> },
  partial_success: { label: "Thành công một phần", tone: "warn", icon: <AlertTriangle size={12} /> },
  failed: { label: "Lỗi", tone: "danger", icon: <XCircle size={12} /> },
  blocked: { label: "Bị chặn", tone: "danger", icon: <XCircle size={12} /> },
  cancelled: { label: "Đã hủy", tone: "danger", icon: <XCircle size={12} /> },
  trashed: { label: "Thùng rác", tone: "danger", icon: <XCircle size={12} /> },
  deleted: { label: "Đã xóa", tone: "danger", icon: <XCircle size={12} /> },
  ignored: { label: "Bỏ qua", tone: "neutral" },
  converted_to_content: { label: "Đã tạo bài", tone: "good", icon: <CheckCircle2 size={12} /> }
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, tone: "neutral" as const };

  return (
    <Badge tone={config.tone}>
      <span className="inline-flex items-center gap-1">
        {config.icon}
        {config.label}
      </span>
    </Badge>
  );
}
