import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";

type CrawlJob = {
  id: string;
  sourcePlatform: string;
  sourceRef: string;
  status: string;
  totalFound: number;
  totalSaved: number;
  totalDuplicate: number;
  totalFailed: number;
  createdAt: string;
  error?: string | null;
};

type CrawlResult = {
  id: string;
  platform: string;
  sourceRef: string;
  externalId: string;
  author?: string | null;
  sourceUrl?: string | null;
  originalText: string;
  media: unknown[];
  comments: unknown[];
  links: unknown[];
  postedAt?: string | null;
  createdAt: string;
  status: string;
};

function trim(value: string, max = 90) {
  return value.length > max ? `${value.slice(0, max)}...` : value || "-";
}

export function CrawlJobsPage() {
  const [form, setForm] = useState({
    sourcePlatform: "facebook",
    sourceRef: "",
    storage: "local",
    crawlComments: true,
    commentMode: "author",
    maxComments: 20,
    limit: 50,
    onlyMedia: false,
    onlyLinks: false
  });

  const createMutation = useMutation({
    mutationFn: () => apiPost<{ crawlJob: CrawlJob }>("/crawl-jobs", {
      sourcePlatform: form.sourcePlatform,
      sourceRef: form.sourceRef,
      options: {
        limit: form.limit,
        onlyMedia: form.onlyMedia,
        onlyLinks: form.onlyLinks
      },
      storageConfig: {
        provider: form.storage
      },
      commentOptions: {
        enabled: form.crawlComments,
        mode: form.commentMode,
        maxComments: form.maxComments
      }
    }),
    onSuccess: () => {
      setForm((current) => ({ ...current, sourceRef: "" }));
    }
  });

  return (
    <>
      <PageHeader
        title="Crawl dữ liệu"
        subtitle="Nhập nguồn crawl thủ công, cấu hình media/comment/storage rồi tạo job để worker xử lý."
        actions={<Link to="/crawl/history"><Button variant="secondary">Mở lịch sử crawl</Button></Link>}
      />
      <SectionCard title="Cấu hình crawl">
        <div className="form-grid">
          <label>
            <Label>Nền tảng</Label>
            <Select value={form.sourcePlatform} onChange={(event) => setForm((current) => ({ ...current, sourcePlatform: event.target.value }))}>
              <option value="facebook">Facebook</option>
              <option value="telegram">Telegram</option>
              <option value="instagram">Instagram</option>
              <option value="threads">Threads</option>
              <option value="web">Website</option>
            </Select>
          </label>
          <label>
            <Label>Storage media</Label>
            <Select value={form.storage} onChange={(event) => setForm((current) => ({ ...current, storage: event.target.value }))}>
              <option value="local">Local</option>
              <option value="cloudinary">Cloudinary key pool</option>
            </Select>
          </label>
          <label className="span-2">
            <Label>Source URL / channel / group / profile</Label>
            <Input value={form.sourceRef} onChange={(event) => setForm((current) => ({ ...current, sourceRef: event.target.value }))} placeholder="https://..." />
          </label>
          <label>
            <Label>Số bài cần crawl</Label>
            <Input type="number" min={1} value={form.limit} onChange={(event) => setForm((current) => ({ ...current, limit: Number(event.target.value) }))} />
          </label>
          <label>
            <Label>Số comment tối đa</Label>
            <Input type="number" min={0} value={form.maxComments} onChange={(event) => setForm((current) => ({ ...current, maxComments: Number(event.target.value) }))} />
          </label>
          <label>
            <Label>Lấy comment</Label>
            <Select value={form.crawlComments ? "yes" : "no"} onChange={(event) => setForm((current) => ({ ...current, crawlComments: event.target.value === "yes" }))}>
              <option value="yes">Có lấy comment</option>
              <option value="no">Không lấy comment</option>
            </Select>
          </label>
          <label>
            <Label>Kiểu comment</Label>
            <Select value={form.commentMode} onChange={(event) => setForm((current) => ({ ...current, commentMode: event.target.value }))}>
              <option value="first">Comment đầu tiên</option>
              <option value="author">Comment của tác giả</option>
              <option value="all">Tối đa theo số lượng</option>
            </Select>
          </label>
          <div className="span-2 checkbox-grid">
            <label className="checkbox-row">
              <input type="checkbox" checked={form.onlyMedia} onChange={(event) => setForm((current) => ({ ...current, onlyMedia: event.target.checked }))} />
              <span>Chỉ lấy bài có media</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={form.onlyLinks} onChange={(event) => setForm((current) => ({ ...current, onlyLinks: event.target.checked }))} />
              <span>Chỉ lấy bài có link</span>
            </label>
          </div>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.sourceRef.trim()}>Bắt đầu crawl</Button>
          <Link to="/crawl/results"><Button variant="secondary">Xem kết quả crawl</Button></Link>
        </div>
      </SectionCard>
    </>
  );
}

export function CrawlHistoryPage() {
  const [status, setStatus] = useState("all");
  const [platform, setPlatform] = useState("all");
  const query = useQuery({
    queryKey: ["crawl-jobs", status, platform],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (status !== "all") params.set("status", status);
      if (platform !== "all") params.set("platform", platform);
      return apiGet<{ crawlJobs: CrawlJob[] }>(`/crawl-jobs?${params.toString()}`);
    }
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "retry" | "cancel" }) => apiPost(`/crawl-jobs/${id}/${action}`, {}),
    onSuccess: () => query.refetch()
  });

  const jobs = query.data?.crawlJobs ?? [];

  return (
    <>
      <PageHeader
        title="Lịch sử crawl"
        subtitle="Theo dõi trạng thái job, số bài lưu mới, bài trùng và lỗi khi crawl."
        actions={<Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>Làm mới</Button>}
      />
      <SectionCard>
        <FilterToolbar>
          <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="all">Tất cả nền tảng</option>
            <option value="facebook">Facebook</option>
            <option value="telegram">Telegram</option>
            <option value="instagram">Instagram</option>
            <option value="threads">Threads</option>
            <option value="web">Website</option>
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="partial_success">Partial success</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </FilterToolbar>
        <AdminDataTable
          rows={jobs}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có lịch sử crawl" description="Tạo job ở trang Crawl dữ liệu để bắt đầu." />}
          columns={[
            { key: "time", header: "Thời gian", render: (row) => new Date(row.createdAt).toLocaleString("vi-VN") },
            { key: "source", header: "Nguồn", render: (row) => <div>{trim(row.sourceRef, 44)}<div className="table-subtle">{row.sourcePlatform}</div></div> },
            { key: "status", header: "Trạng thái", render: (row) => <StatusBadge status={row.status} /> },
            { key: "found", header: "Tìm thấy", render: (row) => row.totalFound },
            { key: "saved", header: "Lưu mới", render: (row) => row.totalSaved },
            { key: "dupe", header: "Trùng", render: (row) => row.totalDuplicate },
            { key: "failed", header: "Lỗi", render: (row) => row.totalFailed },
            {
              key: "actions",
              header: "Thao tác",
              render: (row) => (
                <div className="row-actions">
                  <Link to={`/crawl/results?crawlJobId=${row.id}`}>Xem kết quả</Link>
                  <Button size="sm" variant="secondary" onClick={() => actionMutation.mutate({ id: row.id, action: "retry" })}>Retry</Button>
                  {row.status === "running" ? <Button size="sm" variant="danger" onClick={() => actionMutation.mutate({ id: row.id, action: "cancel" })}>Cancel</Button> : null}
                </div>
              )
            }
          ]}
        />
      </SectionCard>
    </>
  );
}

export function CrawlResultsPage() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["crawl-results", keyword, status],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (status !== "all") params.set("status", status);
      return apiGet<{ results: CrawlResult[] }>(`/crawl-results?${params.toString()}`);
    }
  });

  const createContentMutation = useMutation({
    mutationFn: (ids: string[]) => ids.length === 1
      ? apiPost(`/crawl-results/${ids[0]}/create-content`, {})
      : apiPost("/crawl-results/bulk-create-content", { ids }),
    onSuccess: () => {
      setSelected([]);
      query.refetch();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/crawl-results/${id}`),
    onSuccess: () => query.refetch()
  });

  const results = query.data?.results ?? [];

  return (
    <>
      <PageHeader
        title="Kết quả crawl"
        subtitle="Bảng dữ liệu đã crawl được, có thể xem link/comment/media và tạo bài viết từ raw item."
        actions={<Button variant="secondary" onClick={() => query.refetch()}>Làm mới</Button>}
      />
      <SectionCard>
        <FilterToolbar
          actions={<Button disabled={selected.length === 0} onClick={() => createContentMutation.mutate(selected)}>Tạo bài viết</Button>}
        >
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm nội dung, tác giả, source..." />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="new">Mới</option>
            <option value="converted_to_content">Đã tạo bài viết</option>
            <option value="ignored">Bỏ qua</option>
            <option value="deleted">Đã xóa</option>
          </Select>
        </FilterToolbar>
        <AdminDataTable
          rows={results}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có kết quả crawl" description="Khi worker crawl xong, dữ liệu sẽ được lưu ở đây." />}
          columns={[
            {
              key: "select",
              header: <input type="checkbox" checked={selected.length > 0 && selected.length === results.length} onChange={(event) => setSelected(event.target.checked ? results.map((row) => row.id) : [])} />,
              render: (row) => <input type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />
            },
            { key: "content", header: "Nội dung", render: (row) => trim(row.originalText, 130) },
            { key: "media", header: "Media", render: (row) => row.media?.length ?? 0 },
            { key: "comments", header: "Comments", render: (row) => row.comments?.length ?? 0 },
            { key: "source", header: "Source", render: (row) => <div>{trim(row.sourceRef, 36)}<div className="table-subtle">{row.sourceUrl ?? "-"}</div></div> },
            { key: "author", header: "Author", render: (row) => row.author ?? "-" },
            { key: "links", header: "Links", render: (row) => row.links?.length ?? 0 },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "actions",
              header: "Actions",
              render: (row) => (
                <div className="row-actions">
                  <Button size="sm" variant="secondary" onClick={() => createContentMutation.mutate([row.id])}>Tạo bài</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteMutation.mutate(row.id)}>Xóa</Button>
                </div>
              )
            }
          ]}
        />
      </SectionCard>
    </>
  );
}
