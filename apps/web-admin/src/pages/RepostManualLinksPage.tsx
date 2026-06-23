import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, Save } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api/client";
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

type LinkGroup = {
  contentId: string;
  code: string;
  updatedAt: string;
  links: ContentLink[];
};

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
      toast.success("Đã lưu link thủ công và đưa nội dung vào xử lý tiếp.");
      await queryClient.invalidateQueries({ queryKey: ["content-links", "manual"] });
      await queryClient.invalidateQueries({ queryKey: ["contents", "review-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["contents", "repost-history"] });
    },
    onError: (error) => toast.error(error.message)
  });
  const retry = useMutation({
    mutationFn: (code: string) => apiPost(`/contents/${code}/retry`, {}),
    onSuccess: async () => {
      toast.success("Đã chạy lại xử lý nội dung.");
      await queryClient.invalidateQueries({ queryKey: ["content-links", "manual"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const groups = useMemo<LinkGroup[]>(() => {
    const map = new Map<string, LinkGroup>();
    for (const link of query.data?.links ?? []) {
      const current = map.get(link.contentId) ?? {
        contentId: link.contentId,
        code: link.content.code,
        updatedAt: link.updatedAt,
        links: []
      };
      current.links.push(link);
      if (new Date(link.updatedAt).getTime() > new Date(current.updatedAt).getTime()) current.updatedAt = link.updatedAt;
      map.set(link.contentId, current);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [query.data?.links]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Link lỗi cần xử lý"
        subtitle="Các link mua hàng convert lỗi được gom theo nội dung. Sau khi nhập link affiliate thủ công, hệ thống sẽ xử lý và publish tiếp nếu đủ điều kiện."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
            Làm mới
          </Button>
        }
      />

      <SectionCard title="Nội dung có link cần can thiệp">
        <AdminDataTable
          rows={groups}
          getRowKey={(row) => row.contentId}
          empty={<EmptyState title="Không có link lỗi" description="Link Shopee/Lazada/TikTok convert lỗi sẽ xuất hiện ở đây để nhập thủ công." />}
          columns={[
            {
              key: "content",
              header: "Nội dung",
              render: (row) => (
                <div>
                  <strong>{row.code}</strong>
                  <div className="table-subtle">{formatDateTime(row.updatedAt)}</div>
                  <Button asChild size="sm" variant="link">
                    <Link to={`/contents/${row.code}/edit`}>Mở nội dung</Link>
                  </Button>
                </div>
              )
            },
            {
              key: "links",
              header: "Link lỗi",
              render: (row) => (
                <div className="stack-tight">
                  {row.links.map((link) => (
                    <div key={link.id} className="manual-link-row">
                      <div className="link-cell">
                        <code>{link.originalUrl}</code>
                        {link.error ? <span className="field-error">{link.error}</span> : null}
                        <div className="actions">
                          <Badge tone="neutral">{link.network}</Badge>
                          <StatusBadge status={link.status} />
                        </div>
                      </div>
                      <Input
                        value={convertedUrls[link.id] ?? link.convertedUrl ?? ""}
                        onChange={(event) => setConvertedUrls((current) => ({ ...current, [link.id]: event.target.value }))}
                        placeholder="Dán link affiliate đã convert"
                      />
                      <Button size="sm" icon={<Save aria-hidden />} onClick={() => save.mutate(link)} disabled={save.isPending || !(convertedUrls[link.id] ?? link.convertedUrl ?? "").trim()}>
                        Lưu
                      </Button>
                    </div>
                  ))}
                </div>
              )
            },
            {
              key: "actions",
              header: "Thao tác",
              render: (row) => (
                <Button size="sm" variant="secondary" icon={<RotateCcw aria-hidden />} onClick={() => retry.mutate(row.code)} disabled={retry.isPending}>
                  Retry convert
                </Button>
              )
            }
          ]}
        />
      </SectionCard>
    </div>
  );
}
