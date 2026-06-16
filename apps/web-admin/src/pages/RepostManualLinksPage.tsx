import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save } from "lucide-react";
import { apiGet, apiPut } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { formatDateTime, type ContentLink } from "./repostTypes";

export function RepostManualLinksPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [convertedUrls, setConvertedUrls] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ["content-links", "manual"],
    queryFn: () => apiGet<{ links: ContentLink[] }>("/content-links?status=failed,detected,unsupported&limit=150")
  });

  const save = useMutation({
    mutationFn: (link: ContentLink) => apiPut(`/content-links/${link.id}/manual-convert`, {
      convertedUrl: convertedUrls[link.id] ?? link.convertedUrl ?? ""
    }),
    onSuccess: async () => {
      toast.success("Đã lưu link convert thủ công.");
      await queryClient.invalidateQueries({ queryKey: ["content-links", "manual"] });
      await queryClient.invalidateQueries({ queryKey: ["contents", "review-queue"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const links = query.data?.links ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        title="Link lỗi cần xử lý"
        subtitle="Danh sách link detected/failed/unsupported cần nhập link affiliate đã convert thủ công."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
            Làm mới
          </Button>
        }
      />

      <SectionCard title="Link cần can thiệp">
        <AdminDataTable
          rows={links}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Không có link lỗi" description="Link convert lỗi hoặc link chưa hỗ trợ sẽ xuất hiện ở đây." />}
          columns={[
            {
              key: "content",
              header: "Nội dung",
              render: (row) => (
                <div>
                  <strong>{row.content.code}</strong>
                  <div className="table-subtle">{formatDateTime(row.updatedAt)}</div>
                  <Button asChild size="sm" variant="link">
                    <Link to={`/contents/${row.content.code}/edit`}>Mở nội dung</Link>
                  </Button>
                </div>
              )
            },
            {
              key: "link",
              header: "Link gốc",
              render: (row) => (
                <div className="link-cell">
                  <code>{row.originalUrl}</code>
                  {row.error ? <span className="field-error">{row.error}</span> : null}
                </div>
              )
            },
            { key: "network", header: "Network", render: (row) => <Badge tone="neutral">{row.network}</Badge> },
            { key: "status", header: "Trạng thái", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "manual",
              header: "Link đã convert",
              render: (row) => (
                <Input
                  value={convertedUrls[row.id] ?? row.convertedUrl ?? ""}
                  onChange={(event) => setConvertedUrls((current) => ({ ...current, [row.id]: event.target.value }))}
                  placeholder="Dán link affiliate đã convert"
                />
              )
            },
            {
              key: "actions",
              header: "Thao tác",
              render: (row) => (
                <Button size="sm" icon={<Save aria-hidden />} onClick={() => save.mutate(row)} disabled={save.isPending || !(convertedUrls[row.id] ?? row.convertedUrl ?? "").trim()}>
                  Lưu
                </Button>
              )
            }
          ]}
        />
      </SectionCard>
    </div>
  );
}
