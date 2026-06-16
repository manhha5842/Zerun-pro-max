import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { PostDataTable, type PostAttemptRow, type PostRow } from "../components/common/PostDataTable";
import { SectionCard } from "../components/common/SectionCard";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";

type AttemptRow = PostAttemptRow & {
  id: string;
  contentId: string;
  targetId: string;
  attemptNo: number;
  createdAt: string;
  content: PostRow | null;
  target: { id: string; name: string; platform: string } | null;
};

const historyStatusOptions = [
  ["all", "Tất cả trạng thái"],
  ["published", "Đã đăng"],
  ["success", "Thành công"]
] as const;

function buildHistoryQuery(params: Record<string, string | number>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const text = String(value);
    if (text && text !== "all") search.set(key, text);
  });
  return search.toString();
}

function attemptToPost(attempt: AttemptRow): PostRow {
  const content = attempt.content;
  return {
    id: `${content?.id ?? attempt.contentId}-${attempt.id}`,
    code: content?.code ?? "-",
    platform: attempt.target?.platform ?? content?.platform ?? "-",
    status: attempt.status,
    originalText: content?.originalText ?? "-",
    draftText: content?.draftText,
    finalText: content?.finalText,
    metadata: content?.metadata,
    media: content?.media,
    links: content?.links,
    commentQueues: content?.commentQueues,
    comments: content?.comments,
    publishAttempts: [{ ...attempt, target: attempt.target }],
    source: content?.source ?? null,
    scheduledAt: content?.scheduledAt,
    postedAt: attempt.createdAt,
    createdAt: attempt.createdAt,
    updatedAt: content?.updatedAt ?? attempt.createdAt
  };
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [pageSize, setPageSize] = useState("20");
  const queryString = buildHistoryQuery({ page, limit: pageSize, keyword, status: statusFilter, platform: platformFilter, sortBy, sortOrder });

  const query = useQuery<{ attempts: AttemptRow[]; pagination?: any }>({
    queryKey: ["history", queryString],
    queryFn: () => apiGet(`/history?${queryString}`)
  });

  const rows = useMemo(() => (query.data?.attempts ?? []).map(attemptToPost), [query.data?.attempts]);
  const pagination = query.data?.pagination;

  return (
    <>
      <PageHeader
        title="Lịch sử"
        subtitle="Chỉ lưu các bài đã đăng thành công. Bài failed hoặc cần review nằm trong Kho lưu trữ."
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>Làm mới</Button>}
      />

      <SectionCard title="Lịch sử" description={pagination ? `${pagination.total} bài đã đăng` : ""}>
        <FilterToolbar actions={<Button variant="secondary" onClick={() => query.refetch()}>Áp dụng</Button>}>
          <Input value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} placeholder="Tìm mã bài, nội dung, tài khoản..." />
          <Select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            {historyStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select value={platformFilter} onChange={(event) => { setPlatformFilter(event.target.value); setPage(1); }}>
            <option value="all">Tất cả nền tảng</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="threads">Threads</option>
            <option value="telegram">Telegram</option>
            <option value="x">X / Twitter</option>
            <option value="zalo-personal">Zalo cá nhân</option>
          </Select>
          <Select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }}>
            <option value="createdAt">Sắp xếp theo thời gian</option>
            <option value="code">Sắp xếp theo mã bài</option>
            <option value="account">Sắp xếp theo tài khoản</option>
            <option value="platform">Sắp xếp theo nền tảng</option>
            <option value="status">Sắp xếp theo trạng thái</option>
          </Select>
          <Select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setPage(1); }}>
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </Select>
          <Select value={pageSize} onChange={(event) => { setPageSize(event.target.value); setPage(1); }}>
            <option value="10">10 dòng</option>
            <option value="20">20 dòng</option>
            <option value="50">50 dòng</option>
            <option value="100">100 dòng</option>
          </Select>
        </FilterToolbar>

        <PostDataTable
          rows={rows}
          timeHeader="Thời gian đăng"
          getTimeValue={(row) => row.postedAt ?? row.createdAt}
          empty={<EmptyState title="Chưa có lịch sử" description="Bài đăng thành công sẽ xuất hiện ở đây." />}
          actions={(row) => (
            <Button size="sm" variant="secondary" onClick={() => navigate(`/contents/${row.code}/edit`)}>Chỉnh sửa</Button>
          )}
        />

        {pagination && pagination.totalPages > 1 ? (
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Trang trước</Button>
            <span className="text-muted" style={{ fontSize: 13 }}>Trang {page} / {pagination.totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Trang sau</Button>
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}
