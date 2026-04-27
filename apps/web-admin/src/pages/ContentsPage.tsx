import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, RefreshCw, Table2 } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { BulkActionBar } from "../components/common/BulkActionBar";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { PostDataTable, type PostRow } from "../components/common/PostDataTable";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";

type ContentsData = { contents: PostRow[] };

const activeStatuses = new Set(["draft", "ready_to_publish", "scheduled", "publishing", "paused"]);
const statusOptions = [
  ["all", "Tất cả trạng thái"],
  ["draft", "Nháp"],
  ["ready_to_publish", "Sẵn sàng"],
  ["scheduled", "Đã lên lịch"],
  ["publishing", "Đang đăng"],
  ["paused", "Tạm dừng"]
] as const;

function shorten(value: string, max = 120) {
  if (!value) return "-";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function dateKey(value?: string | null) {
  if (!value) return "Chưa hẹn lịch";
  return new Date(value).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function buildQuery(params: Record<string, string>) {
  const search = new URLSearchParams({ limit: params.limit ?? "100" });
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== "all" && key !== "limit" && key !== "view") search.set(key, value);
  });
  return search.toString();
}

export function ContentsPage() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [sortBy, setSortBy] = useState("scheduledAt");
  const [sortOrder, setSortOrder] = useState("asc");
  const [pageSize, setPageSize] = useState("100");
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [selected, setSelected] = useState<string[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);

  const queryString = buildQuery({ keyword, status, platform, sortBy, sortOrder, limit: "100" });
  const query = useQuery({
    queryKey: ["contents-management", queryString],
    queryFn: () => apiGet<ContentsData>(`/contents?${queryString}`)
  });

  const rows = useMemo(() => {
    const all = query.data?.contents ?? [];
    return all.filter((content) => activeStatuses.has(content.status));
  }, [query.data?.contents]);

  const visibleRows = useMemo(() => rows.slice(0, Number(pageSize)), [pageSize, rows]);
  const groupedByDate = useMemo(() => {
    return rows.reduce<Record<string, PostRow[]>>((groups, content) => {
      const key = dateKey(content.scheduledAt);
      groups[key] = [...(groups[key] ?? []), content];
      return groups;
    }, {});
  }, [rows]);

  const bulkMutation = useMutation({
    mutationFn: (action: string) => apiPost("/contents/bulk-action", {
      action,
      ids: allMatchingSelected ? undefined : selected,
      filter: allMatchingSelected ? { keyword, status, platform, sortBy, sortOrder } : undefined,
      reason: action === "move_to_saved" ? "Admin chuyển vào Kho lưu trữ" : action === "move_to_trash" ? "Admin chuyển vào thùng rác" : undefined
    }),
    onSuccess: () => {
      setSelected([]);
      setAllMatchingSelected(false);
      query.refetch();
    }
  });

  return (
    <>
      <PageHeader
        title="Quản lý bài đăng"
        subtitle="Gộp bài viết và lịch đăng trong một nơi: xem dạng bảng hoặc lịch, mở rộng từng dòng để xem comment và trạng thái comment."
        actions={
          <>
            <Button variant={viewMode === "table" ? "default" : "secondary"} icon={<Table2 aria-hidden />} onClick={() => setViewMode("table")}>Table</Button>
            <Button variant={viewMode === "calendar" ? "default" : "secondary"} icon={<CalendarDays aria-hidden />} onClick={() => setViewMode("calendar")}>Calendar</Button>
            <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>Làm mới</Button>
          </>
        }
      />

      <SectionCard>
        <FilterToolbar actions={<Button variant="secondary" onClick={() => query.refetch()}>Áp dụng</Button>}>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm mã bài, nội dung, nguồn..." />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
            <option value="scheduledAt">Sắp xếp theo lịch đăng</option>
            <option value="createdAt">Sắp xếp theo thời gian tạo</option>
            <option value="updatedAt">Sắp xếp theo cập nhật</option>
            <option value="platform">Sắp xếp theo nền tảng</option>
            <option value="status">Sắp xếp theo trạng thái</option>
            <option value="code">Sắp xếp theo mã bài</option>
          </Select>
          <Select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="asc">Tăng dần</option>
            <option value="desc">Giảm dần</option>
          </Select>
          <Select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
            <option value="10">10 dòng</option>
            <option value="20">20 dòng</option>
            <option value="50">50 dòng</option>
            <option value="100">100 dòng</option>
          </Select>
        </FilterToolbar>

        <BulkActionBar
          selectedCount={selected.length}
          allMatchingSelected={allMatchingSelected}
          onSelectAllMatching={() => setAllMatchingSelected(true)}
          onClear={() => {
            setSelected([]);
            setAllMatchingSelected(false);
          }}
        >
          <Button size="sm" variant="secondary" onClick={() => bulkMutation.mutate("pause")}>Tạm dừng</Button>
          <Button size="sm" variant="secondary" onClick={() => bulkMutation.mutate("resume")}>Tiếp tục</Button>
          <Button size="sm" variant="secondary" onClick={() => bulkMutation.mutate("cancel")}>Hủy</Button>
          <Button size="sm" variant="secondary" onClick={() => bulkMutation.mutate("move_to_saved")}>Kho lưu trữ</Button>
          <Button size="sm" variant="danger" onClick={() => bulkMutation.mutate("move_to_trash")}>Thùng rác</Button>
        </BulkActionBar>

        {viewMode === "table" ? (
          visibleRows.length === 0 ? (
            <EmptyState title="Chưa có bài đăng" description="Bài đang chờ đăng, đã lên lịch hoặc đang xử lý sẽ xuất hiện tại đây." />
          ) : (
            <PostDataTable
              rows={visibleRows}
              selectable
              selectedIds={selected}
              onSelectedIdsChange={setSelected}
              timeHeader="Lịch đăng"
              getTimeValue={(row) => row.scheduledAt}
              actions={(row) => (
                <Button size="sm" variant="secondary" onClick={() => {
                  apiPost("/contents/bulk-action", { action: row.status === "paused" ? "resume" : "pause", ids: [row.id] }).then(() => query.refetch());
                }}>
                  {row.status === "paused" ? "Tiếp tục" : "Tạm dừng"}
                </Button>
              )}
            />
          )
        ) : (
          <div className="calendar-board">
            {Object.entries(groupedByDate).map(([day, items]) => (
              <div key={day} className="calendar-column">
                <div className="calendar-column-head">
                  <strong>{day}</strong>
                  <Badge>{items.length} bài</Badge>
                </div>
                {items.map((content) => (
                  <button key={content.id} className="calendar-card" type="button" onClick={() => setViewMode("table")}>
                    <span>{content.code}</span>
                    <strong>{shorten(content.originalText, 72)}</strong>
                    <small>{content.scheduledAt ? new Date(content.scheduledAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "Chưa hẹn"}</small>
                    <StatusBadge status={content.status} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
