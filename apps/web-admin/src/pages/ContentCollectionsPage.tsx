import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { PostDataTable, type PostRow } from "../components/common/PostDataTable";
import { SectionCard } from "../components/common/SectionCard";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";

function useContents() {
  return useQuery({
    queryKey: ["contents", "collection"],
    queryFn: () => apiGet<{ contents: PostRow[] }>("/contents?limit=100&includeTrash=true")
  });
}

function textMatch(row: PostRow, keyword: string) {
  return !keyword.trim() || [
    row.code,
    row.originalText,
    row.draftText,
    row.finalText,
    row.savedReason,
    row.lastError,
    row.source?.name,
    row.platform,
    row.status
  ].join(" ").toLowerCase().includes(keyword.trim().toLowerCase());
}

function sortRows(rows: PostRow[], sortBy: string, sortOrder: string) {
  const direction = sortOrder === "asc" ? 1 : -1;
  const valueOf = (row: PostRow) => {
    if (sortBy === "account") return row.publishAttempts?.[0]?.target?.name ?? "";
    return String(row[sortBy as keyof PostRow] ?? "");
  };
  return [...rows].sort((a, b) => String(valueOf(a)).localeCompare(String(valueOf(b))) * direction);
}

export function SavedContentsPage() {
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [pageSize, setPageSize] = useState("20");
  const query = useContents();
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => apiPost("/contents/bulk-action", { ids: [id], action }),
    onSuccess: () => query.refetch()
  });

  const rows = useMemo(() => {
    const archiveStatuses = new Set(["saved", "failed"]);
    const filtered = (query.data?.contents ?? [])
      .filter((row) => archiveStatuses.has(row.status))
      .filter((row) => status === "all" || row.status === status)
      .filter((row) => platform === "all" || row.platform === platform)
      .filter((row) => textMatch(row, keyword));
    return sortRows(filtered, sortBy, sortOrder).slice(0, Number(pageSize));
  }, [keyword, pageSize, platform, query.data?.contents, sortBy, sortOrder, status]);

  return (
    <>
      <PageHeader
        title="Kho lưu trữ"
        subtitle="Lưu các bài không đăng được hoặc cần xử lý thủ công, bao gồm bài failed và bài được hệ thống đưa vào review."
      />
      <SectionCard>
        <FilterToolbar actions={<Button variant="secondary" onClick={() => query.refetch()}>Làm mới</Button>}>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm mã bài, nội dung, lý do lỗi..." />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="saved">Đã lưu</option>
            <option value="failed">Failed</option>
          </Select>
          <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="all">Tất cả nền tảng</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="threads">Threads</option>
            <option value="telegram">Telegram</option>
            <option value="manual">Manual</option>
          </Select>
          <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="updatedAt">Sắp xếp theo cập nhật</option>
            <option value="createdAt">Sắp xếp theo thời gian tạo</option>
            <option value="code">Sắp xếp theo mã bài</option>
            <option value="platform">Sắp xếp theo nền tảng</option>
            <option value="status">Sắp xếp theo trạng thái</option>
            <option value="account">Sắp xếp theo tài khoản</option>
          </Select>
          <Select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </Select>
          <Select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
            <option value="10">10 dòng</option>
            <option value="20">20 dòng</option>
            <option value="50">50 dòng</option>
            <option value="100">100 dòng</option>
          </Select>
        </FilterToolbar>
        <PostDataTable
          rows={rows}
          timeHeader="Cập nhật"
          getTimeValue={(row) => row.updatedAt}
          empty={<EmptyState title="Kho lưu trữ đang trống" description="Bài failed hoặc bài cần review sẽ xuất hiện tại đây." />}
          extraColumns={[
            { key: "reason", header: "Lý do", render: (row) => row.savedReason ?? row.lastError ?? "Cần xử lý thủ công" }
          ]}
          detailNote={(row) => row.savedReason ?? row.lastError ?? "Cần xử lý thủ công"}
          actions={(row) => (
            <>
              <Button size="sm" variant="secondary" onClick={() => actionMutation.mutate({ id: row.id, action: "retry" })}>Retry</Button>
              <Button size="sm" variant="secondary" onClick={() => actionMutation.mutate({ id: row.id, action: "resume" })}>Đưa về chờ đăng</Button>
              <Button size="sm" variant="danger" onClick={() => actionMutation.mutate({ id: row.id, action: "move_to_trash" })}>Thùng rác</Button>
            </>
          )}
        />
      </SectionCard>
    </>
  );
}

export function TrashPage() {
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("deletedAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [pageSize, setPageSize] = useState("20");
  const query = useContents();
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => apiPost("/contents/bulk-action", { ids: [id], action }),
    onSuccess: () => query.refetch()
  });

  const rows = useMemo(() => {
    const filtered = (query.data?.contents ?? [])
      .filter((row) => row.status === "trashed")
      .filter((row) => status === "all" || row.status === status)
      .filter((row) => platform === "all" || row.platform === platform)
      .filter((row) => textMatch(row, keyword));
    return sortRows(filtered, sortBy, sortOrder).slice(0, Number(pageSize));
  }, [keyword, pageSize, platform, query.data?.contents, sortBy, sortOrder, status]);

  return (
    <>
      <PageHeader title="Thùng rác" subtitle="Các bài đã xóa mềm. Có thể khôi phục hoặc xóa vĩnh viễn." />
      <SectionCard>
        <FilterToolbar actions={<Button variant="secondary" onClick={() => query.refetch()}>Làm mới</Button>}>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm mã bài, nội dung, tài khoản..." />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="trashed">Thùng rác</option>
          </Select>
          <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="all">Tất cả nền tảng</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="threads">Threads</option>
            <option value="telegram">Telegram</option>
            <option value="manual">Manual</option>
          </Select>
          <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="deletedAt">Sắp xếp theo ngày xóa</option>
            <option value="updatedAt">Sắp xếp theo cập nhật</option>
            <option value="createdAt">Sắp xếp theo thời gian tạo</option>
            <option value="code">Sắp xếp theo mã bài</option>
            <option value="platform">Sắp xếp theo nền tảng</option>
          </Select>
          <Select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </Select>
          <Select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
            <option value="10">10 dòng</option>
            <option value="20">20 dòng</option>
            <option value="50">50 dòng</option>
            <option value="100">100 dòng</option>
          </Select>
        </FilterToolbar>
        <PostDataTable
          rows={rows}
          timeHeader="Ngày xóa"
          getTimeValue={(row) => row.deletedAt ?? row.cancelledAt ?? row.updatedAt}
          empty={<EmptyState title="Thùng rác đang trống" description="Bài bị xóa mềm sẽ xuất hiện ở đây." />}
          actions={(row) => (
            <>
              <Button size="sm" variant="secondary" onClick={() => actionMutation.mutate({ id: row.id, action: "restore" })}>Khôi phục</Button>
              <Button size="sm" variant="danger" onClick={() => actionMutation.mutate({ id: row.id, action: "delete_forever" })}>Xóa vĩnh viễn</Button>
            </>
          )}
        />
      </SectionCard>
    </>
  );
}
