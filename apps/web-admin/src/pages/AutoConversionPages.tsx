import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Play, RefreshCw, TestTube2 } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";

type TargetAccount = {
  id: string;
  kind: "source" | "target";
  name: string;
  platform: string;
  isActive: boolean;
  health: string;
};

type AutoRule = {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  sourcePlatform: string;
  sourceRef: string;
  triggerMode: string;
  pollingIntervalMinutes: number;
  targetAccountIds: string[];
  postType: string;
  commentMode: string;
  includeFirstComment: boolean;
  linkRules?: Record<string, unknown>;
  contentRules?: Record<string, unknown>;
  mediaRules?: Record<string, unknown>;
  scheduleRules?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  runs?: Array<{ id: string; status: string; createdAt: string; errorMessage?: string | null }>;
};

type AutoRun = {
  id: string;
  sourcePlatform: string;
  sourceRef: string;
  originalText: string;
  processedText?: string | null;
  status: string;
  createdAt: string;
  errorMessage?: string | null;
  targetAccountIds: string[];
  rule?: { id: string; name: string };
  links?: Array<{ originalUrl: string; convertedUrl?: string | null; network: string; action: string; error?: string | null }>;
  media?: Array<{ sourceUrl: string; status: string; error?: string | null }>;
};

const defaultRuleForm = {
  name: "",
  description: "",
  sourcePlatform: "facebook",
  sourceRef: "",
  triggerMode: "polling",
  pollingIntervalMinutes: 15,
  postType: "feed",
  includeFirstComment: false,
  commentMode: "none",
  customComment: "",
  targetAccountIds: [] as string[],
  linkRules: {
    shopee: "convert",
    lazada: "convert",
    unknown: "saved_for_review",
    google: "saved_for_review"
  },
  contentRules: {
    rewriteByAi: false,
    removeUnsupportedLinkBlock: true
  },
  mediaRules: {
    ingestMedia: true,
    storage: "local"
  },
  scheduleRules: {
    mode: "after_convert",
    randomDelayMinutes: 0,
    dailyLimitPerAccount: 20
  }
};

function shortText(value: string, max = 96) {
  if (!value) return "-";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function useTargetAccounts() {
  return useQuery({
    queryKey: ["accounts", "targets"],
    queryFn: () => apiGet<{ accounts: TargetAccount[] }>("/accounts")
  });
}

export function AutoConversionRulesPage() {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("all");
  const [enabled, setEnabled] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultRuleForm);
  const accountsQuery = useTargetAccounts();

  const rulesQuery = useQuery({
    queryKey: ["auto-conversion-rules", keyword, platform, enabled],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (platform !== "all") params.set("sourcePlatform", platform);
      if (enabled !== "all") params.set("enabled", enabled);
      return apiGet<{ rules: AutoRule[] }>(`/auto-conversion/rules?${params.toString()}`);
    }
  });

  const targets = useMemo(
    () => (accountsQuery.data?.accounts ?? []).filter((account) => account.kind === "target"),
    [accountsQuery.data]
  );

  const createMutation = useMutation({
    mutationFn: () => apiPost("/auto-conversion/rules", form),
    onSuccess: async () => {
      setForm(defaultRuleForm);
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["auto-conversion-rules"] });
    }
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" | "run-now" | "test" }) => {
      const path = action === "run-now" ? "run-now" : action;
      return apiPost(`/auto-conversion/rules/${id}/${path}`, {});
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["auto-conversion-rules"] }),
        queryClient.invalidateQueries({ queryKey: ["auto-conversion-runs"] })
      ]);
    }
  });

  const rules = rulesQuery.data?.rules ?? [];
  const runningToday = rules.reduce((count, rule) => count + (rule.runs?.filter((run) => new Date(run.createdAt).toDateString() === new Date().toDateString()).length ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Cấu hình chuyển đổi tự động"
        subtitle="Tạo rule 1 nguồn sang nhiều tài khoản đích, xử lý content/media/link rồi đăng ngay hoặc lên lịch."
        actions={
          <>
            <Button onClick={() => setShowForm((value) => !value)}>Tạo cấu hình</Button>
            <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => rulesQuery.refetch()}>Làm mới</Button>
          </>
        }
      />

      <div className="metric-grid">
        <SectionCard title="Tổng rule"><strong>{rules.length}</strong></SectionCard>
        <SectionCard title="Đang bật"><strong>{rules.filter((rule) => rule.enabled).length}</strong></SectionCard>
        <SectionCard title="Lỗi gần nhất"><strong>{rules.find((rule) => rule.runs?.[0]?.status === "failed")?.runs?.[0]?.errorMessage ?? "Không có"}</strong></SectionCard>
        <SectionCard title="Chạy hôm nay"><strong>{runningToday}</strong></SectionCard>
      </div>

      {showForm ? (
        <SectionCard title="Tạo cấu hình" description="Các nhóm field bám theo flow: nguồn, đích, content/link, media, lịch đăng và review.">
          <div className="form-grid">
            <label>
              <Label>Tên cấu hình</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="VD: Lấy bài từ group deal" />
            </label>
            <label>
              <Label>Nền tảng nguồn</Label>
              <Select value={form.sourcePlatform} onChange={(event) => setForm((current) => ({ ...current, sourcePlatform: event.target.value }))}>
                <option value="facebook">Facebook</option>
                <option value="telegram">Telegram</option>
                <option value="instagram">Instagram</option>
                <option value="threads">Threads</option>
                <option value="web">Website</option>
              </Select>
            </label>
            <label className="span-2">
              <Label>Channel / group / profile / URL nguồn</Label>
              <Input value={form.sourceRef} onChange={(event) => setForm((current) => ({ ...current, sourceRef: event.target.value }))} placeholder="https://..." />
            </label>
            <label>
              <Label>Trigger</Label>
              <Select value={form.triggerMode} onChange={(event) => setForm((current) => ({ ...current, triggerMode: event.target.value }))}>
                <option value="polling">Polling theo chu kỳ</option>
                <option value="realtime">Realtime nếu nền tảng hỗ trợ</option>
              </Select>
            </label>
            <label>
              <Label>Phút kiểm tra</Label>
              <Input type="number" value={form.pollingIntervalMinutes} onChange={(event) => setForm((current) => ({ ...current, pollingIntervalMinutes: Number(event.target.value) }))} />
            </label>
            <label>
              <Label>Loại bài đăng</Label>
              <Select value={form.postType} onChange={(event) => setForm((current) => ({ ...current, postType: event.target.value }))}>
                <option value="feed">Feed</option>
                <option value="story">Story</option>
                <option value="reel">Reel</option>
              </Select>
            </label>
            <label>
              <Label>Comment đầu tiên</Label>
              <Select value={form.commentMode} onChange={(event) => setForm((current) => ({ ...current, commentMode: event.target.value, includeFirstComment: event.target.value !== "none" }))}>
                <option value="none">Không dùng</option>
                <option value="original_first_comment">Lấy comment gốc đầu tiên</option>
                <option value="ai_generated">AI tạo comment</option>
                <option value="custom">Comment tùy chỉnh</option>
              </Select>
            </label>
            <div className="span-2">
              <Label>Tài khoản đích</Label>
              <div className="checkbox-grid">
                {targets.map((target) => (
                  <label key={target.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.targetAccountIds.includes(target.id)}
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          targetAccountIds: event.target.checked
                            ? [...current.targetAccountIds, target.id]
                            : current.targetAccountIds.filter((id) => id !== target.id)
                        }));
                      }}
                    />
                    <span>{target.name} · {target.platform}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="span-2">
              <Label>Mô tả</Label>
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Ghi chú rule, nguồn và rule link đặc biệt..." />
            </label>
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Lưu cấu hình</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Đóng</Button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard>
        <FilterToolbar
          actions={<Button variant="secondary" onClick={() => rulesQuery.refetch()}>Làm mới bảng</Button>}
        >
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên rule, nguồn..." />
          <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="all">Tất cả nền tảng</option>
            <option value="facebook">Facebook</option>
            <option value="telegram">Telegram</option>
            <option value="instagram">Instagram</option>
            <option value="threads">Threads</option>
            <option value="web">Website</option>
          </Select>
          <Select value={enabled} onChange={(event) => setEnabled(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="true">Đang bật</option>
            <option value="false">Đang tạm dừng</option>
          </Select>
        </FilterToolbar>

        <AdminDataTable
          rows={rules}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có cấu hình" description="Tạo rule đầu tiên để hệ thống tự lấy bài mới và xử lý sang tài khoản đích." />}
          columns={[
            { key: "name", header: "Tên rule", render: (row) => <div><strong>{row.name}</strong><div className="table-subtle">{row.description ?? "Không có mô tả"}</div></div> },
            { key: "source", header: "Nguồn", render: (row) => <div>{row.sourcePlatform}<div className="table-subtle">{shortText(row.sourceRef, 42)}</div></div> },
            { key: "trigger", header: "Trigger", render: (row) => <span>{row.triggerMode === "polling" ? `${row.pollingIntervalMinutes} phút` : "Realtime"}</span> },
            { key: "target", header: "Đích", render: (row) => <Badge>{row.targetAccountIds?.length ?? 0} tài khoản</Badge> },
            { key: "rules", header: "Xử lý link/content", render: () => <span>Shopee/Lazada convert · link lạ lưu duyệt</span> },
            { key: "status", header: "Trạng thái", render: (row) => <StatusBadge status={row.enabled ? "active" : "paused"} /> },
            { key: "last", header: "Lần chạy gần nhất", render: (row) => row.runs?.[0] ? <StatusBadge status={row.runs[0].status} /> : <span className="table-subtle">Chưa chạy</span> },
            {
              key: "actions",
              header: "Thao tác",
              render: (row) => (
                <div className="row-actions">
                  <Button size="sm" variant="secondary" icon={<TestTube2 aria-hidden />} onClick={() => actionMutation.mutate({ id: row.id, action: "test" })}>Test</Button>
                  <Button size="sm" variant="secondary" icon={<Play aria-hidden />} onClick={() => actionMutation.mutate({ id: row.id, action: "run-now" })}>Run now</Button>
                  <Button size="sm" variant="secondary" onClick={() => actionMutation.mutate({ id: row.id, action: row.enabled ? "pause" : "resume" })}>{row.enabled ? "Pause" : "Resume"}</Button>
                  <Link to={`/auto-conversion/history?ruleId=${row.id}`}>Lịch sử</Link>
                </div>
              )
            }
          ]}
        />
      </SectionCard>
    </>
  );
}

export function AutoConversionHistoryPage() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const runsQuery = useQuery({
    queryKey: ["auto-conversion-runs", keyword, status],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (status !== "all") params.set("status", status);
      return apiGet<{ runs: AutoRun[] }>(`/auto-conversion/runs?${params.toString()}`);
    }
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/auto-conversion/runs/${id}/retry`, {}),
    onSuccess: () => runsQuery.refetch()
  });

  const runs = runsQuery.data?.runs ?? [];

  return (
    <>
      <PageHeader
        title="Lịch sử chuyển đổi tự động"
        subtitle="Theo dõi từng lần phát hiện bài mới, xử lý link/media/AI và kết quả đăng hoặc lưu duyệt."
        actions={<Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => runsQuery.refetch()}>Làm mới</Button>}
      />
      <SectionCard>
        <FilterToolbar>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm nội dung, nguồn, lỗi..." />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="new_detected">Mới phát hiện</option>
            <option value="ready_to_publish">Sẵn sàng đăng</option>
            <option value="saved_for_review">Lưu để duyệt</option>
            <option value="published">Đã đăng</option>
            <option value="failed">Lỗi</option>
          </Select>
        </FilterToolbar>
        <AdminDataTable
          rows={runs}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có lịch sử" description="Khi rule chạy, từng lần xử lý sẽ xuất hiện ở đây." />}
          columns={[
            { key: "time", header: "Thời gian", render: (row) => new Date(row.createdAt).toLocaleString("vi-VN") },
            { key: "rule", header: "Rule", render: (row) => row.rule?.name ?? "-" },
            { key: "source", header: "Nguồn", render: (row) => <div>{row.sourcePlatform}<div className="table-subtle">{shortText(row.sourceRef, 36)}</div></div> },
            { key: "content", header: "Preview content", render: (row) => shortText(row.processedText ?? row.originalText, 120) },
            { key: "status", header: "Trạng thái", render: (row) => <StatusBadge status={row.status} /> },
            { key: "links", header: "Link", render: (row) => `${row.links?.length ?? 0} link` },
            { key: "media", header: "Media", render: (row) => `${row.media?.length ?? 0} file` },
            { key: "targets", header: "Đích đăng", render: (row) => `${row.targetAccountIds?.length ?? 0} tài khoản` },
            { key: "error", header: "Lỗi", render: (row) => row.errorMessage ? <span className="text-danger">{row.errorMessage}</span> : <span className="table-subtle">Không có</span> },
            { key: "actions", header: "Thao tác", render: (row) => <Button size="sm" variant="secondary" onClick={() => retryMutation.mutate(row.id)}>Retry</Button> }
          ]}
        />
      </SectionCard>
    </>
  );
}
