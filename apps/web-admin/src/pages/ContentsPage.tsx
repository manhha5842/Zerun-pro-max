import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, RefreshCw, Search } from "lucide-react";
import { apiGet } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

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

const statusLabel: Record<string, string> = {
  ready_to_publish: "Sẵn sàng đăng",
  published: "Đã đăng",
  scheduled: "Đã lên lịch",
  publishing: "Đang đăng",
  failed: "Lỗi",
  draft: "Nháp"
};

export function ContentsPage() {
  const [keyword, setKeyword] = useState("");
  const query = useQuery({ queryKey: ["contents"], queryFn: () => apiGet<ContentsData>("/contents?limit=50") });

  const filteredContents = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return query.data?.contents ?? [];

    return (query.data?.contents ?? []).filter((content) => {
      const haystack = [content.code, content.platform, content.source?.name ?? "", content.originalText, content.status].join(" ").toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }, [keyword, query.data?.contents]);

  return (
    <>
      <PageHeader
        title="Quản lý bài viết"
        subtitle="Danh sách bài đã nhập, crawl hoặc import. Ưu tiên nhìn nhanh, bấm nhanh, không làm bạn phải đọc từng ô."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>
            Làm mới
          </Button>
        }
      />

      <SectionCard
        title="Danh sách bài viết"
        description={`${filteredContents.length} bài`}
        actions={
          <div className="contents-toolbar">
            <div className="contents-search">
              <Search aria-hidden size={15} />
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm theo mã, nguồn, nội dung..." />
            </div>
          </div>
        }
      >
        {filteredContents.length === 0 ? (
          <EmptyState title="Chưa có bài viết" description={keyword ? "Không tìm thấy bài nào khớp từ khóa." : "Bài crawl/import hoặc nhập tay sẽ xuất hiện tại đây."} />
        ) : (
          <div className="content-list">
            {filteredContents.map((content) => (
              <a key={content.id} href={`/contents/${content.code}`} className="content-row-link">
                <article className="content-row-card">
                  <div className="content-row-main">
                    <div className="content-row-head">
                      <div className="content-row-title-wrap">
                        <div className="content-row-code">{content.code}</div>
                        <div className="content-row-meta">
                          <span>{content.source?.name ?? content.platform}</span>
                          <span>•</span>
                          <span>{new Date(content.createdAt).toLocaleString("vi-VN")}</span>
                        </div>
                      </div>
                      <StatusBadge status={content.status} />
                    </div>

                    <div className="content-row-text">{content.originalText?.trim() || "Không có nội dung"}</div>
                  </div>

                  <div className="content-row-side">
                    <div className="content-row-side-top">
                      <div className="content-row-platform">
                        <FileText aria-hidden size={15} />
                        <span>{content.platform}</span>
                      </div>
                    </div>
                    <div className="content-row-action">{statusLabel[content.status] ?? content.status} • Xem chi tiết</div>
                  </div>
                </article>
              </a>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
