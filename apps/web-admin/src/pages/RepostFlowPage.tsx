import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronUp, Link2, PackageCheck, Play, Plus, RefreshCw, Route, Send, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import { isImageMedia, isVideoMedia, mediaPathOf, mediaUrlOf } from "../utils/media";
import { formatDateTime, platformLabel, type Pagination, type PlatformChannel, type RepostFlow, type RepostSourceHistoryItem } from "./repostTypes";

type PipelineStepId = "source" | "group" | "ai" | "link" | "route" | "publish";
type StepStatus = "ok" | "warning" | "error" | "disabled";

type FlowDraft = {
  name: string;
  description: string;
  sourceChannelIds: string[];
  targetChannelIds: string[];
  useAI: boolean;
  autoPublish: boolean;
  requireReview: boolean;
  isActive: boolean;
};

type DryRunLine = {
  step: string;
  result: string;
  tone: "good" | "warn" | "danger" | "neutral";
};

const EMPTY_CHANNELS: PlatformChannel[] = [];
const EMPTY_FLOWS: RepostFlow[] = [];
const EMPTY_HISTORY: RepostSourceHistoryItem[] = [];

type SourceHistoryResponse = {
  items: RepostSourceHistoryItem[];
  summary: {
    maxItems: number;
    statusCounts: Record<string, number>;
  };
  pagination: Pagination;
};

const SOURCE_HISTORY_STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "published,publishing,scheduled", label: "Đã reup / đang đăng" },
  { value: "failed,waiting_manual_convert", label: "Lỗi / cần xử lý" },
  { value: "skipped,rejected,duplicate", label: "Không phù hợp / trùng" },
  { value: "discovered,processing,ready_to_publish", label: "Đang xử lý" }
];

function defaultDraft(): FlowDraft {
  return {
    name: "",
    description: "",
    sourceChannelIds: [],
    targetChannelIds: [],
    useAI: true,
    autoPublish: false,
    requireReview: true,
    isActive: true
  };
}

function readFlowDraft(flow: RepostFlow): FlowDraft {
  const targetChannelIds = flow.targets.map((target) => target.channelId);
  return {
    name: flow.name,
    description: flow.description ?? "",
    sourceChannelIds: flow.sources.map((source) => source.channelId),
    targetChannelIds,
    useAI: flow.useAI,
    autoPublish: flow.autoPublish,
    requireReview: flow.requireReview,
    isActive: flow.isActive
  };
}

function channelStatus(channel: PlatformChannel) {
  const metadata = channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
    ? channel.metadata as Record<string, unknown>
    : {};
  return {
    mode: typeof metadata.realtimeStatus === "string" ? metadata.realtimeStatus : "Realtime",
    lastMessageAt: typeof metadata.lastMessageAt === "string" ? metadata.lastMessageAt : null,
    lastCrawledAt: typeof metadata.lastCrawledAt === "string" ? metadata.lastCrawledAt : null,
    lastError: typeof metadata.lastError === "string" ? metadata.lastError : null
  };
}

function countTargets(targets: PlatformChannel[]) {
  return {
    all: targets.filter((target) => target.isActive && target.filterMode === "all").length,
    category: targets.filter((target) => target.isActive && target.filterMode === "category").length
  };
}

function targetBadgeText(target: PlatformChannel) {
  if (target.filterMode === "all") return "Nhận tất cả";
  const categories = target.acceptedCategories?.length ? target.acceptedCategories.join(", ") : "chưa chọn ngành";
  return `Theo ngành: ${categories}`;
}

function pluralSource(count: number) {
  return count === 1 ? "1 nguồn" : `${count} nguồn`;
}

function pluralTarget(count: number) {
  return count === 1 ? "1 kênh đích" : `${count} kênh đích`;
}

function statusLabel(status: StepStatus) {
  const labels: Record<StepStatus, string> = {
    ok: "OK",
    warning: "Warning",
    error: "Error",
    disabled: "Disabled"
  };
  return labels[status];
}

function statusTone(status: StepStatus): "good" | "warn" | "danger" | "neutral" {
  if (status === "ok") return "good";
  if (status === "warning") return "warn";
  if (status === "error") return "danger";
  return "neutral";
}

export function RepostFlowPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<PipelineStepId>("source");
  const [showSourceDetails, setShowSourceDetails] = useState(false);
  const [draft, setDraft] = useState<FlowDraft>(defaultDraft);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dryRunText, setDryRunText] = useState("Lẹ, đang giảm https://s.shopee.vn/abc");
  const [dryRunTimeline, setDryRunTimeline] = useState<DryRunLine[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historySourceId, setHistorySourceId] = useState("all");
  const [historyKeyword, setHistoryKeyword] = useState("");

  const sourcesQuery = useQuery({
    queryKey: ["channels", "source"],
    queryFn: () => apiGet<{ channels: PlatformChannel[] }>("/channels?role=source")
  });
  const targetsQuery = useQuery({
    queryKey: ["channels", "target"],
    queryFn: () => apiGet<{ channels: PlatformChannel[] }>("/channels?role=target")
  });
  const flowsQuery = useQuery({
    queryKey: ["repost-flows"],
    queryFn: () => apiGet<{ flows: RepostFlow[] }>("/repost-flows")
  });
  const historyQueryString = useMemo(() => {
    const params = new URLSearchParams({
      flowId: selectedFlowId ?? "",
      page: String(historyPage),
      limit: "20",
      status: historyStatus,
      sourceChannelId: historySourceId
    });
    if (historyKeyword.trim()) params.set("keyword", historyKeyword.trim());
    return params.toString();
  }, [historyKeyword, historyPage, historySourceId, historyStatus, selectedFlowId]);
  const sourceHistoryQuery = useQuery({
    queryKey: ["repost-source-history", selectedFlowId, historyPage, historyStatus, historySourceId, historyKeyword],
    queryFn: () => apiGet<SourceHistoryResponse>(`/repost-flows/source-history?${historyQueryString}`),
    enabled: Boolean(selectedFlowId)
  });

  const sources = sourcesQuery.data?.channels ?? EMPTY_CHANNELS;
  const targets = targetsQuery.data?.channels ?? EMPTY_CHANNELS;
  const flows = flowsQuery.data?.flows ?? EMPTY_FLOWS;
  const selectedFlow = selectedFlowId ? flows.find((flow) => flow.id === selectedFlowId) ?? null : null;
  const selectedSources = useMemo(() => sources.filter((source) => draft.sourceChannelIds.includes(source.id)), [draft.sourceChannelIds, sources]);
  const selectedTargets = useMemo(() => targets.filter((target) => draft.targetChannelIds.includes(target.id)), [draft.targetChannelIds, targets]);
  const routingTargets = selectedTargets.filter((target) => target.isActive);
  const targetSummary = countTargets(routingTargets);
  const sourceStatusRows = selectedSources.map((source) => ({ channel: source, status: channelStatus(source) }));
  const sourceSummary = {
    active: selectedSources.filter((source) => source.isActive).length,
    realtime: sourceStatusRows.filter((item) => item.status.mode.toLowerCase().includes("realtime")).length,
    polling: sourceStatusRows.filter((item) => !item.status.mode.toLowerCase().includes("realtime")).length,
    errors: sourceStatusRows.filter((item) => item.status.lastError).length
  };
  const errorCount = sourceSummary.errors + (routingTargets.length === 0 ? 1 : 0);
  const flowSummary = routingTargets.length === 0
    ? `Tin từ ${pluralSource(selectedSources.length)} chưa thể đăng vì không có kênh đích nào đang bật.`
    : targetSummary.all > 0
      ? `Tin từ ${pluralSource(selectedSources.length)} sẽ được xử lý và đăng vào ${pluralTarget(routingTargets.length)}, trong đó ${targetSummary.all} kênh nhận tất cả.`
      : `Tin từ ${pluralSource(selectedSources.length)} sẽ được xử lý và route theo ngành vào ${pluralTarget(routingTargets.length)}.`;

  const historyItems = sourceHistoryQuery.data?.items ?? EMPTY_HISTORY;
  const historyPagination = sourceHistoryQuery.data?.pagination;
  const historyTotal = historyPagination?.total ?? 0;

  useEffect(() => {
    if (!selectedFlowId && flows.length > 0) setSelectedFlowId(flows[0].id);
  }, [flows, selectedFlowId]);

  useEffect(() => {
    if (!selectedFlow) return;
    setDraft(readFlowDraft(selectedFlow));
    setSaveState("saved");
    setDryRunTimeline([]);
  }, [selectedFlow]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyKeyword, historySourceId, historyStatus, selectedFlowId]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["repost-flows"] });
  const persistFlow = useMutation({
    mutationFn: ({ id, draft: nextDraft }: { id: string; draft: FlowDraft }) => apiPut<{ flow: RepostFlow }>(`/repost-flows/${id}`, {
      name: nextDraft.name.trim() || "Luồng chưa đặt tên",
      description: nextDraft.description.trim(),
      sourceChannelIds: nextDraft.sourceChannelIds,
      targetChannelIds: nextDraft.targetChannelIds,
      useAI: true,
      autoPublish: nextDraft.autoPublish,
      requireReview: !nextDraft.autoPublish,
      isActive: nextDraft.isActive
    }),
    onSuccess: async () => {
      setSaveState("saved");
      await invalidate();
    },
    onError: (error) => {
      setSaveState("error");
      toast.error(error.message);
    }
  });
  const createFlow = useMutation({
    mutationFn: () => apiPost<{ flow: RepostFlow }>("/repost-flows", {
      name: `Luồng mới ${flows.length + 1}`,
      description: "",
      sourceChannelIds: [],
      targetChannelIds: [],
      useAI: true,
      autoPublish: false,
      requireReview: true,
      isActive: true
    }),
    onSuccess: async (data) => {
      setSelectedFlowId(data.flow.id);
      setDraft(readFlowDraft(data.flow));
      setSaveState("saved");
      toast.success("Đã tạo luồng mới.");
      await invalidate();
    },
    onError: (error) => toast.error(error.message)
  });
  const deleteFlow = useMutation({
    mutationFn: (id: string) => apiDelete(`/repost-flows/${id}`),
    onSuccess: async () => {
      setSelectedFlowId(null);
      setDraft(defaultDraft());
      toast.success("Đã xóa flow.");
      await invalidate();
    },
    onError: (error) => toast.error(error.message)
  });
  const testCrawl = useMutation({
    mutationFn: (channelIds: string[]) => Promise.all(channelIds.map((channelId) => apiPost<{ message: string }>(`/channels/${channelId}/test-crawl`, {}))),
    onSuccess: (results) => toast.success(results[0]?.message ?? "Realtime listener đang theo dõi các nguồn đã chọn."),
    onError: (error) => toast.error(error.message)
  });

  const saveDraft = () => {
    if (!selectedFlow) return;
    setSaveState("saving");
    persistFlow.mutate({ id: selectedFlow.id, draft });
  };

  const toggleChannel = (kind: "source" | "target", id: string) => {
    const key = kind === "source" ? "sourceChannelIds" : "targetChannelIds";
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id]
    }));
    setSaveState("idle");
  };

  const runDryRun = () => {
    const text = dryRunText.trim();
    const hasCommerceLink = /(shopee|lazada|tiktok|s\.shopee|c\.lazada)/i.test(text);
    const shouldPublish = hasCommerceLink || /deal|sale|giảm|mã|voucher/i.test(text);
    const matchedTargets = routingTargets.map((target) => target.name);
    const linkResult = hasCommerceLink ? "converted" : "skipped";
    const finalAction = !shouldPublish
      ? "skipped"
      : routingTargets.length === 0
        ? "choose target"
        : hasCommerceLink
          ? "publish"
          : "skipped";

    setDryRunTimeline([
      { step: "Gom gói", result: "Gom 1 tin trong cửa sổ 2 phút.", tone: "good" },
      { step: "AI", result: `shouldPublish=${shouldPublish ? "true" : "false"} · category=general · reason=${shouldPublish ? "Có tín hiệu deal hoặc link mua hàng." : "Không thấy tín hiệu deal đủ rõ."}`, tone: shouldPublish ? "good" : "warn" },
      { step: "Link", result: hasCommerceLink ? "converted · link sẽ được thay bằng affiliate." : "skipped · không có link Shopee/Lazada/TikTok.", tone: hasCommerceLink ? "good" : "neutral" },
      { step: "Target", result: matchedTargets.length > 0 ? matchedTargets.join(", ") : "Không có kênh đích nào đang bật.", tone: matchedTargets.length > 0 ? "good" : "danger" },
      { step: "Final action", result: finalAction, tone: finalAction === "publish" ? "good" : finalAction === "choose target" ? "danger" : "warn" }
    ]);
  };

  const pipelineSteps: Array<{ id: PipelineStepId; label: string; status: StepStatus; detail: string; icon: ReactNode }> = [
    { id: "source", label: "Nguồn", status: selectedSources.length === 0 ? "warning" : sourceSummary.errors > 0 ? "error" : "ok", detail: `${sourceSummary.active} nguồn đang bật · ${sourceSummary.realtime} realtime · ${sourceSummary.errors} lỗi`, icon: <PackageCheck aria-hidden /> },
    { id: "group", label: "Gom tin", status: "ok", detail: "Bật · cửa sổ 2 phút · AI hỗ trợ khi khó ghép", icon: <PackageCheck aria-hidden /> },
    { id: "ai", label: "AI", status: draft.useAI ? "ok" : "disabled", detail: "deal-analysis-vNext · output shouldPublish/category/rewrite", icon: <Bot aria-hidden /> },
    { id: "link", label: "Đổi link", status: "ok", detail: "Theo Affiliate Settings · link lỗi chuyển Manual Links", icon: <Link2 aria-hidden /> },
    { id: "route", label: "Route", status: routingTargets.length === 0 ? "error" : "ok", detail: routingTargets.length === 0 ? "Flow này chưa chọn kênh đích active." : `Flow này đăng vào ${pluralTarget(routingTargets.length)} đã chọn.`, icon: <Route aria-hidden /> },
    { id: "publish", label: "Đăng", status: !draft.isActive ? "disabled" : draft.autoPublish ? "ok" : "warning", detail: draft.autoPublish ? "Auto publish khi đủ điều kiện." : "Cần duyệt khi có việc phải xử lý.", icon: <Send aria-hidden /> }
  ];
  const currentStep = pipelineSteps.find((step) => step.id === selectedStep) ?? pipelineSteps[0];

  return (
    <div className="page-stack repost-flow-workbench">
      <PageHeader
        title="Luồng đăng lại"
        subtitle={`Pipeline mặc định: ${flowSummary}`}
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => { void sourcesQuery.refetch(); void targetsQuery.refetch(); void flowsQuery.refetch(); }}>
              Làm mới
            </Button>
            <Button variant="secondary" icon={<Play aria-hidden />} onClick={runDryRun}>
              Chạy thử flow
            </Button>
            <Button icon={<Plus aria-hidden />} onClick={() => createFlow.mutate()} disabled={createFlow.isPending}>
              Tạo luồng
            </Button>
          </>
        }
      />

      <div className="flow-summary-strip">
        <strong>{flowSummary}</strong>
        <span>Nguồn → Gom tin → AI → Đổi link → Route → Đăng</span>
      </div>

      <div className="flow-top-grid">
        <SectionCard title="Danh sách Flow">
          {flows.length === 0 ? (
            <EmptyState title="Chưa có flow" description="Tạo flow đầu tiên để bắt đầu lấy tin và đăng lại." />
          ) : (
            <div className="stack-tight">
              {flows.map((flow) => (
                <button
                  key={flow.id}
                  className={`flow-list-item-v2 ${flow.id === selectedFlowId ? "active" : ""}`}
                  type="button"
                  onClick={() => setSelectedFlowId(flow.id)}
                >
                  <strong>{flow.name}</strong>
                  <span>{flow.sources.length} nguồn · {flow.targets.length} kênh đích</span>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Tổng quan luồng"
          actions={
            <div className="actions">
              <Badge tone={saveState === "error" ? "danger" : saveState === "saved" ? "good" : "neutral"}>
                {saveState === "saving" ? "Đang lưu" : saveState === "saved" ? "Đã lưu" : saveState === "error" ? "Lưu lỗi" : "Có thay đổi"}
              </Badge>
              <Button size="sm" onClick={saveDraft} disabled={!selectedFlow || persistFlow.isPending}>Lưu</Button>
            </div>
          }
        >
          <div className="flow-overview-layout">
            <div className="flow-overview-form">
              <label><Label>Tên flow</Label><Input value={draft.name} onChange={(event) => { setDraft((current) => ({ ...current, name: event.target.value })); setSaveState("idle"); }} /></label>
              <label><Label>Trạng thái</Label><Select value={String(draft.isActive)} onChange={(event) => { setDraft((current) => ({ ...current, isActive: event.target.value === "true" })); setSaveState("idle"); }}><option value="true">Đang bật</option><option value="false">Tạm tắt</option></Select></label>
              <label><Label>Cách đăng</Label><Select value={draft.autoPublish ? "auto" : "manual"} onChange={(event) => { setDraft((current) => ({ ...current, autoPublish: event.target.value === "auto", requireReview: event.target.value !== "auto" })); setSaveState("idle"); }}><option value="auto">Auto publish</option><option value="manual">Cần duyệt</option></Select></label>
            </div>
            <div className="flow-overview-metrics">
              <Metric label="Số nguồn" value={selectedSources.length} />
              <Metric label="Số kênh đích" value={routingTargets.length} />
              <Metric label="Kênh nhận tất cả" value={targetSummary.all} />
              <Metric label="Kênh theo ngành" value={targetSummary.category} />
              <Metric label="Lỗi cần xử lý" value={errorCount} tone={errorCount > 0 ? "danger" : "good"} />
            </div>
          </div>
          {selectedFlow ? (
            <div className="actions">
              <Button variant="danger" icon={<Trash2 aria-hidden />} onClick={() => deleteFlow.mutate(selectedFlow.id)} disabled={deleteFlow.isPending}>
                Xóa flow
              </Button>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Pipeline">
        <div className="flow-pipeline-visual" aria-label="Nguồn → Gom tin → AI → Đổi link → Route → Đăng">
          {pipelineSteps.map((step, index) => (
            <div className="flow-pipeline-step-wrap" key={step.id}>
              <button className={`flow-pipeline-step ${selectedStep === step.id ? "active" : ""} ${step.status}`} type="button" onClick={() => setSelectedStep(step.id)}>
                <span className="flow-pipeline-icon">{step.icon}</span>
                <strong>{step.label}</strong>
                <Badge tone={statusTone(step.status)}>{statusLabel(step.status)}</Badge>
              </button>
              {index < pipelineSteps.length - 1 ? <span className="flow-pipeline-arrow">→</span> : null}
            </div>
          ))}
        </div>
        <div className={`flow-step-detail ${currentStep.status}`}>
          <div>
            <strong>{currentStep.label}</strong>
            <p>{currentStep.detail}</p>
          </div>
          {currentStep.id === "route" && routingTargets.length === 0 ? (
            <Badge tone="danger">Không có kênh đích nào đang bật.</Badge>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Chạy thử flow"
        description="Dán một tin mẫu để xem pipeline quyết định gì trước khi publish thật."
        actions={<Button icon={<Play aria-hidden />} onClick={runDryRun}>Chạy thử</Button>}
      >
        <Textarea value={dryRunText} onChange={(event) => setDryRunText(event.target.value)} />
        {dryRunTimeline.length > 0 ? (
          <div className="flow-dry-run-timeline">
            {dryRunTimeline.map((item) => (
              <div className="flow-dry-run-line" key={item.step}>
                <Badge tone={item.tone}>{item.step}</Badge>
                <span>{item.result}</span>
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Nguồn đang lấy tin"
        description={`${sourceSummary.active} nguồn đang bật · ${sourceSummary.realtime} realtime · ${sourceSummary.errors} lỗi`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowSourceDetails((current) => !current)}>
              {showSourceDetails ? "Ẩn chi tiết nguồn" : "Xem chi tiết nguồn"}
            </Button>
            <Button variant="secondary" onClick={() => testCrawl.mutate(selectedSources.map((source) => source.id))} disabled={testCrawl.isPending || selectedSources.length === 0}>
              Kiểm tra realtime
            </Button>
          </>
        }
      >
        <div className="flow-source-summary">
          <Metric label="Nguồn đang bật" value={sourceSummary.active} />
          <Metric label="Realtime" value={sourceSummary.realtime} />
          <Metric label="Lỗi" value={sourceSummary.errors} tone={sourceSummary.errors > 0 ? "danger" : "good"} />
        </div>
        <ChannelPicker channels={sources} selectedIds={draft.sourceChannelIds} kind="source" onToggle={toggleChannel} compact />
        {showSourceDetails ? (
          <div className="flow-source-table">
            {sourceStatusRows.map(({ channel, status }) => (
              <div className="flow-source-row" key={channel.id}>
                <strong>{channel.name}</strong>
                <span>{platformLabel(channel.platform)}</span>
                <span>{status.mode}</span>
                <span>Tin gần nhất: {formatDateTime(status.lastMessageAt)}</span>
                <span>Cập nhật gần nhất: {formatDateTime(status.lastMessageAt ?? status.lastCrawledAt)}</span>
                <Badge tone={status.lastError ? "danger" : "good"}>{status.lastError ? "Có lỗi" : "Ổn"}</Badge>
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Kênh đích của flow">
        <div className={routingTargets.length > 0 ? "flow-info-note good" : "flow-info-note warn"}>
          <strong>{routingTargets.length > 0 ? `Flow này đăng vào ${pluralTarget(routingTargets.length)} đã chọn.` : "Flow này chưa chọn kênh đích active."}</strong>
          <span>Chỉ các kênh được chọn bên dưới mới nhận bài từ flow này. Kênh nhận tất cả: {targetSummary.all}. Kênh theo ngành: {targetSummary.category}.</span>
        </div>
        <ChannelPicker channels={targets} selectedIds={draft.targetChannelIds} kind="target" onToggle={toggleChannel} />
        <TargetList targets={routingTargets} />
      </SectionCard>

      <SectionCard
        title="Lịch sử lấy nguồn tin"
        description={`Log theo content package đã lấy từ nguồn. Backend giữ tối đa ${sourceHistoryQuery.data?.summary.maxItems ?? 2000} nội dung mới nhất; bản cũ hơn sẽ tự xoá.`}
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => sourceHistoryQuery.refetch()} disabled={sourceHistoryQuery.isFetching || !selectedFlowId}>
            Làm mới
          </Button>
        }
      >
        <div className="flow-history-toolbar">
          <label>
            <Label>Nguồn</Label>
            <Select value={historySourceId} onChange={(event) => setHistorySourceId(event.target.value)}>
              <option value="all">Tất cả nguồn trong flow</option>
              {selectedSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </Select>
          </label>
          <label>
            <Label>Trạng thái</Label>
            <Select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}>
              {SOURCE_HISTORY_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>
          <label>
            <Label>Tìm kiếm</Label>
            <Input value={historyKeyword} onChange={(event) => setHistoryKeyword(event.target.value)} placeholder="Mã, nội dung, lỗi..." />
          </label>
        </div>

        {sourceHistoryQuery.isLoading ? (
          <EmptyState title="Đang tải lịch sử" description="Đang đọc các package đã crawl và trạng thái xử lý." />
        ) : historyItems.length === 0 ? (
          <EmptyState title="Chưa có log lấy nguồn tin" description="Bấm kiểm tra realtime hoặc chờ worker crawl nguồn để xem package, ảnh và trạng thái tại đây." />
        ) : (
          <div className="flow-history-list">
            {historyItems.map((item) => (
              <SourceHistoryRow key={item.id} item={item} />
            ))}
          </div>
        )}

        {historyPagination && historyPagination.totalPages > 1 ? (
          <div className="flow-history-pagination">
            <Button variant="secondary" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}>Trang trước</Button>
            <span>Trang {historyPagination.page} / {historyPagination.totalPages} · {historyTotal} nội dung</span>
            <Button variant="secondary" size="sm" disabled={historyPage >= historyPagination.totalPages} onClick={() => setHistoryPage((current) => current + 1)}>Trang sau</Button>
          </div>
        ) : (
          <p className="table-subtle flow-history-count">{historyTotal} nội dung</p>
        )}
      </SectionCard>
    </div>
  );
}

function SourceHistoryRow({ item }: { item: RepostSourceHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const text = item.finalText ?? item.draftText ?? item.originalText;
  const publishError = item.publishAttempts.find((attempt) => attempt.error)?.error;
  const linkError = item.links.find((link) => link.error)?.error;
  const reason = String(item.decision.reason ?? item.savedReason ?? item.lastError ?? publishError ?? linkError ?? "");
  const convertedCount = item.links.filter((link) => link.status === "converted").length;
  const latestPublish = item.publishAttempts[0];

  return (
    <article className="flow-history-row">
      <div className="flow-history-main">
        <div className="flow-history-heading">
          <div>
            <strong>{item.code}</strong>
            <span>{item.sourceChannelName ?? item.sourceName ?? platformLabel(item.platform)} · {formatDateTime(item.createdAt)}</span>
          </div>
          <StatusBadge status={item.status} />
        </div>
        <p>{text.slice(0, 260)}</p>
        <div className="flow-history-meta">
          <Badge tone="neutral">{item.package.rawMessageCount} tin đã gom</Badge>
          <Badge tone={item.package.mediaCount > 0 ? "good" : "neutral"}>{item.package.mediaCount} media</Badge>
          <Badge tone={convertedCount > 0 ? "good" : item.links.length > 0 ? "warn" : "neutral"}>{convertedCount}/{item.links.length} link đổi</Badge>
          {latestPublish ? <Badge tone={latestPublish.status === "success" || latestPublish.status === "completed" ? "good" : latestPublish.error ? "danger" : "neutral"}>{latestPublish.targetName ?? "Publish"}: {latestPublish.status}</Badge> : null}
        </div>
        {item.package.groupingReason ? <div className="table-subtle">Gom tin: {item.package.groupingReason}</div> : null}
        {reason ? <div className="flow-history-reason">{reason}</div> : null}
        <Button size="sm" variant="secondary" onClick={() => setExpanded((current) => !current)}>
          {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          {expanded ? "Ẩn chi tiết" : "Mở chi tiết"}
        </Button>
      </div>
      <HistoryMediaStrip media={item.media} code={item.code} />
      {expanded ? <SourceHistoryDetails item={item} /> : null}
    </article>
  );
}

function SourceHistoryDetails({ item }: { item: RepostSourceHistoryItem }) {
  const text = item.finalText ?? item.draftText ?? item.originalText;
  const rawMessages = item.package.rawMessages ?? [];

  return (
    <div className="flow-history-detail">
      <div className="flow-history-detail-grid">
        <section className="flow-history-detail-section">
          <h4>Nội dung xuất ra để reup</h4>
          <pre>{text || "Chưa có nội dung."}</pre>
          <div className="flow-history-detail-meta">
            <Badge tone="neutral">Mã: {item.code}</Badge>
            <Badge tone="neutral">{item.sourceChannelName ?? item.sourceName ?? platformLabel(item.platform)}</Badge>
            <Badge tone="neutral">Tạo lúc {formatDateTime(item.createdAt)}</Badge>
          </div>
        </section>

        <section className="flow-history-detail-section">
          <h4>Package tin nhắn nguồn</h4>
          {rawMessages.length > 0 ? (
            <div className="flow-history-message-list">
              {rawMessages.map((message, index) => (
                <div className="flow-history-message-card" key={message.id || `${item.id}-message-${index}`}>
                  <div>
                    <strong>{message.senderName || message.senderId || `Tin nhắn ${index + 1}`}</strong>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p>{message.text || "Tin nhắn không có text."}</p>
                  <div className="flow-history-detail-meta">
                    <Badge tone={message.mediaCount ? "good" : "neutral"}>{message.mediaCount ?? 0} media</Badge>
                    <Badge tone={message.links?.length ? "good" : "neutral"}>{message.links?.length ?? 0} link</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="table-subtle">Package này chưa lưu danh sách tin nhắn thô; đang hiển thị nội dung gom ở trên.</p>
          )}
        </section>
      </div>

      <div className="flow-history-detail-grid">
        <section className="flow-history-detail-section">
          <h4>Link đã xử lý</h4>
          {item.links.length > 0 ? (
            <div className="flow-history-link-list">
              {item.links.map((link) => (
                <div key={link.id}>
                  <Badge tone={link.status === "converted" ? "good" : link.error ? "danger" : "neutral"}>{link.status}</Badge>
                  <span>{link.convertedUrl || link.originalUrl}</span>
                  {link.convertedUrl ? <small>Gốc: {link.originalUrl}</small> : null}
                  {link.error ? <small className="danger-text">{link.error}</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="table-subtle">Không phát hiện link trong package này.</p>
          )}
        </section>

        <section className="flow-history-detail-section">
          <h4>Lịch sử reup</h4>
          {item.publishAttempts.length > 0 ? (
            <div className="flow-history-link-list">
              {item.publishAttempts.map((attempt) => (
                <div key={attempt.id}>
                  <Badge tone={attempt.status === "success" || attempt.status === "completed" ? "good" : attempt.error ? "danger" : "neutral"}>{attempt.status}</Badge>
                  <span>{attempt.targetName ?? "Kênh đích"}</span>
                  <small>{formatDateTime(attempt.completedAt ?? attempt.createdAt)}</small>
                  {attempt.resultUrl ? <small>{attempt.resultUrl}</small> : null}
                  {attempt.error ? <small className="danger-text">{attempt.error}</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="table-subtle">Chưa có lần reup nào cho package này.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function HistoryMediaStrip({ media, code }: { media: RepostSourceHistoryItem["media"]; code: string }) {
  if (media.length === 0) {
    return <div className="flow-history-no-media">Không có ảnh</div>;
  }

  const visible = media.slice(0, 4);
  return (
    <div className="flow-history-media">
      {visible.map((item, index) => {
        const src = mediaUrlOf(item);
        if (src && isImageMedia(item)) {
          return <img key={item.id ?? `${code}-${index}`} src={src} alt={`Ảnh ${index + 1} của ${code}`} loading="lazy" />;
        }
        return (
          <div className="flow-history-media-fallback" key={item.id ?? `${code}-${index}`}>
            {isVideoMedia(item) ? "Video" : mediaPathOf(item) || "Media"}
          </div>
        );
      })}
      {media.length > visible.length ? <span className="flow-history-media-more">+{media.length - visible.length}</span> : null}
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: "good" | "danger" | "neutral" }) {
  return (
    <div className={`flow-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TargetList({ targets }: { targets: PlatformChannel[] }) {
  if (targets.length === 0) {
    return (
      <div className="flow-info-note danger">
        <AlertTriangle aria-hidden />
        <span>Không có kênh đích nào đang bật.</span>
      </div>
    );
  }
  return (
    <div className="flow-target-list">
      {targets.map((target) => (
        <div className="flow-target-row" key={target.id}>
          <div>
            <strong>{target.name}</strong>
            <span>{platformLabel(target.platform)} · {target.externalId}</span>
          </div>
          <Badge tone={target.filterMode === "all" ? "good" : "warn"}>{targetBadgeText(target)}</Badge>
          <span className="table-subtle">
            {target.filterMode === "all" ? `${target.name} nhận tất cả bài.` : `${target.name} chỉ nhận ngành phù hợp.`}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChannelPicker({
  channels,
  selectedIds,
  kind,
  onToggle,
  compact = false
}: {
  channels: PlatformChannel[];
  selectedIds: string[];
  kind: "source" | "target";
  onToggle: (kind: "source" | "target", id: string) => void;
  compact?: boolean;
}) {
  if (channels.length === 0) {
    return <EmptyState title={kind === "source" ? "Chưa có kênh nguồn" : "Chưa có kênh đích"} description="Vào Quản lý kênh để thêm kênh trước." />;
  }
  return (
    <div className={`flow-channel-grid ${compact ? "compact" : ""}`}>
      {channels.map((channel) => {
        const selected = selectedIds.includes(channel.id);
        return (
          <button key={channel.id} type="button" className={`flow-channel-card ${selected ? "selected" : ""}`} onClick={() => onToggle(kind, channel.id)}>
            <div>
              <strong>{channel.name}</strong>
              <span>{platformLabel(channel.platform)} · {channel.externalId}</span>
            </div>
            <div className="actions">
              {kind === "target" ? <Badge tone={channel.filterMode === "category" ? "warn" : "good"}>{targetBadgeText(channel)}</Badge> : null}
              <Badge tone={channel.isActive ? "good" : "neutral"}>{channel.isActive ? "Đang bật" : "Tạm tắt"}</Badge>
              {selected ? <CheckCircle2 aria-hidden /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
