import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet } from "../api/client";
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
      <header className="page-head">
        <div>
          <h1 className="page-title">Nội dung</h1>
          <p className="page-subtitle">Danh sách nội dung đã crawl hoặc import, sẵn sàng để sửa, duyệt, lên lịch và đăng.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>
          Làm mới
        </Button>
      </header>
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Nguồn</th>
              <th>Nội dung</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
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
          </tbody>
        </table>
      </div>
    </>
  );
}
