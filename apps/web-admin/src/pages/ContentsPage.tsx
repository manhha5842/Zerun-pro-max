import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet } from "../api/client";
import { DataTable } from "../components/common/DataTable";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";

type ContentsData = {
  contents: Array<{
    id: string;
    code: string;
    platform: string;
    status: string;
    originalText: string;
    createdAt: string;
    source?: { name: string } | null;
  }>;
};

export function ContentsPage() {
  const query = useQuery({ queryKey: ["contents"], queryFn: () => apiGet<ContentsData>("/contents?limit=50") });

  return (
    <>
      <PageHeader
        title="Nội dung"
        subtitle="Danh sách nội dung đã crawl hoặc import, sẵn sàng để sửa, duyệt, lên lịch và đăng."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>
            Làm mới
          </Button>
        }
      />
      <SectionCard padded={false}>
        <DataTable
          columns={
            <>
              <th>Mã</th>
              <th>Nguồn</th>
              <th>Nội dung</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th>Thao tác</th>
            </>
          }
          empty={
            query.data && query.data.contents.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState title="Chưa có nội dung" description="Nội dung crawl/import sẽ xuất hiện tại đây." />
                </td>
              </tr>
            ) : null
          }
        >
          {(query.data?.contents ?? []).map((content) => (
            <tr key={content.id}>
              <td>
                <a href={`/contents/${content.code}`} className="text-primary hover:underline">{content.code}</a>
              </td>
              <td>{content.source?.name ?? content.platform}</td>
              <td>{content.originalText.slice(0, 120)}</td>
              <td>
                <StatusBadge status={content.status} />
              </td>
              <td>{new Date(content.createdAt).toLocaleString("vi-VN")}</td>
              <td>
                <a href={`/contents/${content.code}`} className="text-sm text-primary hover:underline">Xem chi tiết</a>
              </td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>
    </>
  );
}
