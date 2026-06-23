import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { formatDateTime, readReviewMetadata, type RepostContent } from "./repostTypes";

function categoryOf(content: RepostContent) {
  const { review, analysis } = readReviewMetadata(content);
  return {
    primary: String(review.primaryCategory ?? analysis.primaryCategory ?? "-"),
    debugScore: typeof review.categoryConfidence === "number"
      ? review.categoryConfidence
      : typeof analysis.categoryConfidence === "number"
        ? analysis.categoryConfidence
        : null
  };
}

export function RepostHistoryPage() {
  const query = useQuery({
    queryKey: ["contents", "repost-history"],
    queryFn: () => apiGet<{ contents: RepostContent[] }>("/contents?limit=100")
  });

  const contents = (query.data?.contents ?? []).filter((content) => {
    const metadata = content.metadata ?? {};
    return Boolean(content.sourceId || metadata.ai || metadata.review || Array.isArray(content.scheduledTargets));
  });

  return (
    <div className="page-stack">
      <PageHeader
        title="Lịch sử đăng lại"
        subtitle="Theo dõi nội dung đã được xử lý qua pipeline đăng lại, gồm quyết định AI, target match và trạng thái hiện tại."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
            Làm mới
          </Button>
        }
      />

      <SectionCard title="Nội dung đã xử lý">
        <AdminDataTable
          rows={contents}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có lịch sử đăng lại" description="Khi worker xử lý nội dung từ nguồn, lịch sử sẽ hiển thị tại đây." />}
          columns={[
            {
              key: "content",
              header: "Nội dung",
              render: (row) => (
                <div className="content-cell">
                  <strong>{row.code}</strong>
                  <p>{(row.finalText ?? row.draftText ?? row.originalText).slice(0, 140)}</p>
                  <Button asChild size="sm" variant="link">
                    <Link to={`/contents/${row.code}/edit`}>Mở chi tiết</Link>
                  </Button>
                </div>
              )
            },
            { key: "status", header: "Trạng thái", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "category",
              header: "Ngành",
              render: (row) => {
                const category = categoryOf(row);
                return (
                  <div className="stack-tight">
                    <Badge tone="neutral">{category.primary}</Badge>
                    <span className="table-subtle">{category.debugScore === null ? "Debug score: -" : `Debug score: ${category.debugScore.toFixed(2)}`}</span>
                  </div>
                );
              }
            },
            {
              key: "targets",
              header: "Target",
              render: (row) => {
                const count = Array.isArray(row.scheduledTargets) ? row.scheduledTargets.length : 0;
                return count === 0 ? <Badge tone="danger">Chưa có target</Badge> : <Badge tone="good">{count} target</Badge>;
              }
            },
            { key: "created", header: "Thời gian", render: (row) => formatDateTime(row.createdAt) },
            { key: "reason", header: "Ghi chú", render: (row) => <span className="table-subtle">{row.savedReason ?? "-"}</span> }
          ]}
        />
      </SectionCard>
    </div>
  );
}
