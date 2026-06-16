import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { formatDateTime, readReviewMetadata, type RepostContent } from "./repostTypes";

function readCategories(content: RepostContent) {
  const { review, analysis } = readReviewMetadata(content);
  const primaryCategory = String(review.primaryCategory ?? analysis.primaryCategory ?? "-");
  const secondaryCategories = Array.isArray(review.secondaryCategories)
    ? review.secondaryCategories.map(String)
    : Array.isArray(analysis.secondaryCategories)
      ? analysis.secondaryCategories.map(String)
      : [];
  const categoryConfidence = typeof review.categoryConfidence === "number"
    ? review.categoryConfidence
    : typeof analysis.categoryConfidence === "number"
      ? analysis.categoryConfidence
      : null;
  return { primaryCategory, secondaryCategories, categoryConfidence, review, analysis };
}

export function RepostReviewQueuePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ["contents", "review-queue"],
    queryFn: () => apiGet<{ contents: RepostContent[] }>("/contents?status=waiting_manual_convert&limit=100")
  });

  const mutateContent = useMutation({
    mutationFn: ({ code, action }: { code: string; action: "publish" | "reject" | "retry" }) => apiPost(`/contents/${code}/${action}`, {}),
    onMutate: async (input) => {
      if (input.action !== "publish") return;
      await queryClient.cancelQueries({ queryKey: ["contents", "review-queue"] });
      const previous = queryClient.getQueryData<{ contents: RepostContent[] }>(["contents", "review-queue"]);
      queryClient.setQueryData<{ contents: RepostContent[] }>(["contents", "review-queue"], (current) => ({
        contents: (current?.contents ?? []).filter((content) => content.code !== input.code)
      }));
      return { previous };
    },
    onSuccess: async (_, input) => {
      toast.success(input.action === "publish" ? "Đã đưa nội dung vào hàng đợi đăng." : "Đã cập nhật nội dung.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contents", "review-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["contents", "repost-history"] })
      ]);
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["contents", "review-queue"], context.previous);
      toast.error(error.message);
    }
  });

  const contents = query.data?.contents ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        title="Hàng chờ duyệt"
        subtitle="Nội dung AI/routing chưa đủ điều kiện auto-publish. Ưu tiên kiểm tra confidence ngành, target match và link lỗi."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
            Làm mới
          </Button>
        }
      />

      <SectionCard title="Nội dung cần duyệt">
        <AdminDataTable
          rows={contents}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Không có nội dung chờ duyệt" description="Khi AI confidence thấp hoặc không match target, nội dung sẽ xuất hiện tại đây." />}
          columns={[
            {
              key: "content",
              header: "Nội dung",
              render: (row) => (
                <div className="content-cell">
                  <strong>{row.code}</strong>
                  <p>{(row.finalText ?? row.draftText ?? row.originalText).slice(0, 150)}</p>
                  <div className="table-subtle">{formatDateTime(row.createdAt)}</div>
                </div>
              )
            },
            {
              key: "category",
              header: "Ngành AI",
              render: (row) => {
                const { primaryCategory, secondaryCategories, categoryConfidence } = readCategories(row);
                return (
                  <div className="stack-tight">
                    <Badge tone={categoryConfidence !== null && categoryConfidence < 0.75 ? "warn" : "good"}>{primaryCategory}</Badge>
                    {secondaryCategories.length > 0 ? <span className="table-subtle">Phụ: {secondaryCategories.join(", ")}</span> : null}
                    <span className="table-subtle">Confidence: {categoryConfidence === null ? "-" : categoryConfidence.toFixed(2)}</span>
                  </div>
                );
              }
            },
            {
              key: "targets",
              header: "Target match",
              render: (row) => {
                const { review } = readCategories(row);
                const matched = Array.isArray(review.matchedTargetIds) ? review.matchedTargetIds.map(String) : row.scheduledTargets ?? [];
                return matched.length === 0 ? <Badge tone="danger">Không có đích phù hợp</Badge> : <Badge tone="good">{matched.length} target</Badge>;
              }
            },
            {
              key: "reason",
              header: "Lý do giữ lại",
              render: (row) => {
                const { review, analysis } = readCategories(row);
                return (
                  <span className="table-subtle">
                    {String(review.routingHoldReason ?? row.savedReason ?? analysis.categoryReason ?? "Cần người duyệt trước khi đăng.")}
                  </span>
                );
              }
            },
            {
              key: "actions",
              header: "Thao tác",
              render: (row) => (
                <div className="row-actions">
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/contents/${row.code}/edit`}>Mở chi tiết</Link>
                  </Button>
                  <Button size="sm" icon={<CheckCircle2 aria-hidden />} onClick={() => mutateContent.mutate({ code: row.code, action: "publish" })} disabled={mutateContent.isPending}>
                    Duyệt đăng
                  </Button>
                  <Button size="sm" variant="secondary" icon={<RotateCcw aria-hidden />} onClick={() => mutateContent.mutate({ code: row.code, action: "retry" })} disabled={mutateContent.isPending}>
                    Chạy lại
                  </Button>
                  <Button size="sm" variant="danger" icon={<XCircle aria-hidden />} onClick={() => mutateContent.mutate({ code: row.code, action: "reject" })} disabled={mutateContent.isPending}>
                    Từ chối
                  </Button>
                </div>
              )
            }
          ]}
        />
      </SectionCard>
    </div>
  );
}
