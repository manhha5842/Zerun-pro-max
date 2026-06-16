import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import { platformLabel, type PlatformChannel, type RepostFlow } from "./repostTypes";

type ProcessNodeId = "collect" | "rule" | "ai" | "convert" | "router";
type SelectedNode =
  | { kind: "flow"; id: "flow" }
  | { kind: "source"; id: string }
  | { kind: "target"; id: string }
  | { kind: "process"; id: ProcessNodeId };

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

type ProcessStep = { id: ProcessNodeId; label: string; detail: string; tone: "blue" | "slate" | "violet" | "green" | "amber" };

type RuleTestResult = {
  action: "process" | "skip" | "review" | "link_error" | "hold";
  reasons: string[];
  matchedRules: string[];
};

type RuleConfig = {
  duplicateEnabled: boolean;
  duplicateMethods: string[];
  lookbackDays: "7" | "14" | "30";
  duplicateAction: "skip" | "review";
  skipDomains: string;
  allowedNetworks: string[];
  junkOnlyAction: "skip" | "review";
  brokenLinkAction: "review" | "link_error";
  requireDealKeyword: boolean;
  dealKeywords: string;
  bannedKeywords: string;
  noPurchaseLinkAction: "skip" | "review";
  shortCommentAction: "skip" | "review";
  allowMedia: boolean;
  imageOnlyAction: "review" | "ocr" | "skip";
  visionSuspectAction: "review";
  defaultAction: "process" | "skip" | "review" | "link_error" | "hold";
  sampleContent: string;
  testResult?: RuleTestResult;
};

type FlowNodeConfig = {
  collect: {
    realtime: boolean;
    crawlIntervalMinutes: number;
    batchSize: number;
    includeMedia: boolean;
    skipOwnMessages: boolean;
  };
  rule: RuleConfig;
  ai: {
    enabled: boolean;
    mode: "classify_rewrite" | "classify_only" | "rewrite_only";
    confidenceThreshold: number;
    lowConfidenceAction: "review" | "hold";
    visionMode: "off" | "review_only";
  };
  convert: {
    enabled: boolean;
    allowedNetworks: string[];
    failedAction: "review" | "link_error";
    keepOriginalOnFail: boolean;
  };
  router: {
    confidenceThreshold: number;
    lowConfidenceAction: "review" | "hold";
    noMatchAction: "review" | "hold";
    generalContentMode: "allow_target_general" | "only_receive_all";
  };
};

const PROCESS_STEPS: ProcessStep[] = [
  { id: "collect", label: "Thu thập", detail: "Lấy nội dung mới", tone: "blue" },
  { id: "rule", label: "Bộ lọc", detail: "Lọc trùng, link rác, spam", tone: "amber" },
  { id: "ai", label: "AI xử lý", detail: "Phân loại, viết lại", tone: "violet" },
  { id: "convert", label: "Đổi link", detail: "Affiliate/API", tone: "green" },
  { id: "router", label: "Chia kênh", detail: "Gửi đúng kênh đích", tone: "blue" }
];

const EMPTY_CHANNELS: PlatformChannel[] = [];
const EMPTY_FLOWS: RepostFlow[] = [];
const NODE_CONFIG_STORAGE_KEY = "zerun-flow-node-config-v1";

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

function defaultNodeConfig(): FlowNodeConfig {
  return {
    collect: {
      realtime: true,
      crawlIntervalMinutes: 15,
      batchSize: 20,
      includeMedia: true,
      skipOwnMessages: true
    },
    rule: {
      duplicateEnabled: true,
      duplicateMethods: ["externalId", "normalized_url", "text_hash"],
      lookbackDays: "30",
      duplicateAction: "skip",
      skipDomains: "youtube.com, forms.gle, docs.google.com, t.me, telegram.me",
      allowedNetworks: ["Shopee", "Lazada", "TikTok Shop", "AccessTrade"],
      junkOnlyAction: "skip",
      brokenLinkAction: "link_error",
      requireDealKeyword: true,
      dealKeywords: "deal, mã, sale, giảm, back mã, áp xu, hoàn xu, voucher, freeship",
      bannedKeywords: "spam, tuyển ref, click nhiệm vụ",
      noPurchaseLinkAction: "review",
      shortCommentAction: "skip",
      allowMedia: true,
      imageOnlyAction: "review",
      visionSuspectAction: "review",
      defaultAction: "process",
      sampleContent: ""
    },
    ai: {
      enabled: true,
      mode: "classify_rewrite",
      confidenceThreshold: 0.85,
      lowConfidenceAction: "review",
      visionMode: "off"
    },
    convert: {
      enabled: true,
      allowedNetworks: ["Shopee", "Lazada", "TikTok Shop", "AccessTrade"],
      failedAction: "link_error",
      keepOriginalOnFail: true
    },
    router: {
      confidenceThreshold: 0.85,
      lowConfidenceAction: "review",
      noMatchAction: "hold",
      generalContentMode: "allow_target_general"
    }
  };
}

function loadNodeConfigStore() {
  try {
    const raw = localStorage.getItem(NODE_CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, FlowNodeConfig> : {};
  } catch {
    return {};
  }
}

function readFlowDraft(flow: RepostFlow): FlowDraft {
  return {
    name: flow.name,
    description: flow.description ?? "",
    sourceChannelIds: flow.sources.map((source) => source.channelId),
    targetChannelIds: flow.targets.map((target) => target.channelId),
    useAI: flow.useAI,
    autoPublish: flow.autoPublish,
    requireReview: flow.requireReview,
    isActive: flow.isActive
  };
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function evaluateRuleSample(config: RuleConfig): RuleTestResult {
  const sample = config.sampleContent.trim();
  const text = sample.toLowerCase();
  const reasons: string[] = [];
  const matchedRules: string[] = [];
  let action: RuleTestResult["action"] = config.defaultAction;

  const hasLink = /https?:\/\/\S+/i.test(sample);
  const skipDomains = splitList(config.skipDomains);
  const onlySkipDomain = hasLink && skipDomains.some((domain) => text.includes(domain)) && !/(shopee|lazada|tiktok|accesstrade)/i.test(sample);
  const dealKeywords = splitList(config.dealKeywords);
  const hasDealKeyword = dealKeywords.some((keyword) => text.includes(keyword));
  const bannedKeywords = splitList(config.bannedKeywords);
  const hasBannedKeyword = bannedKeywords.some((keyword) => text.includes(keyword));

  if (!sample) {
    return { action: "hold", reasons: ["Chưa có nội dung mẫu để test."], matchedRules: ["empty_sample"] };
  }
  if (config.duplicateEnabled && /(duplicate|trùng|trung|đã đăng|da dang)/i.test(sample)) {
    action = config.duplicateAction;
    reasons.push(`Nghi trùng trong ${config.lookbackDays} ngày.`);
    matchedRules.push("duplicate_detection");
  }
  if (onlySkipDomain) {
    action = config.junkOnlyAction;
    reasons.push("Nội dung chỉ có link thuộc domain bỏ qua.");
    matchedRules.push("junk_domain_only");
  }
  if (/(link lỗi|404|not found|dead link|không mở được)/i.test(sample)) {
    action = config.brokenLinkAction;
    reasons.push("Có dấu hiệu link lỗi.");
    matchedRules.push("broken_link");
  }
  if (config.requireDealKeyword && !hasDealKeyword) {
    action = action === "process" ? "review" : action;
    reasons.push("Không thấy keyword deal đủ rõ.");
    matchedRules.push("missing_deal_keyword");
  }
  if (hasBannedKeyword) {
    action = "skip";
    reasons.push("Có keyword cấm hoặc dấu hiệu spam.");
    matchedRules.push("banned_keyword");
  }
  if (!hasLink) {
    action = config.noPurchaseLinkAction;
    reasons.push("Không có link mua hàng.");
    matchedRules.push("no_purchase_link");
  }
  if (sample.length < 24) {
    action = config.shortCommentAction;
    reasons.push("Nội dung quá ngắn giống comment.");
    matchedRules.push("short_comment");
  }

  if (reasons.length === 0) {
    reasons.push("Đủ điều kiện đi tiếp sang AI/Convert/Router.");
    matchedRules.push("default_process");
  }
  return { action, reasons, matchedRules };
}

function ToggleRow({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string }) {
  return (
    <label className="flow-toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

function CheckboxPill({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flow-checkbox-pill ${checked ? "active" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function selectedNodeTitle(selectedNode: SelectedNode, source?: PlatformChannel, target?: PlatformChannel) {
  if (selectedNode.kind === "source") return source?.name ?? "Kênh nguồn";
  if (selectedNode.kind === "target") return target?.name ?? "Kênh đích";
  if (selectedNode.kind === "flow") return "Cấu hình flow";
  return PROCESS_STEPS.find((step) => step.id === selectedNode.id)?.label ?? "Node";
}

function translateRuleAction(action: RuleTestResult["action"]) {
  const labels: Record<RuleTestResult["action"], string> = {
    process: "Cho xử lý tiếp",
    skip: "Bỏ qua",
    review: "Đưa vào hàng chờ duyệt",
    link_error: "Đưa vào danh sách link lỗi",
    hold: "Giữ lại"
  };
  return labels[action];
}

function translateMatchedRule(rule: string) {
  const labels: Record<string, string> = {
    empty_sample: "chưa có nội dung mẫu",
    duplicate_detection: "nghi trùng nội dung",
    junk_domain_only: "chỉ có link không dùng được",
    broken_link: "link lỗi",
    missing_deal_keyword: "thiếu keyword deal",
    banned_keyword: "keyword cấm/spam",
    no_purchase_link: "không có link mua hàng",
    short_comment: "nội dung quá ngắn",
    default_process: "đủ điều kiện đi tiếp"
  };
  return labels[rule] ?? rule;
}

export function RepostFlowPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [flowSearch, setFlowSearch] = useState("");
  const [flowListCollapsed, setFlowListCollapsed] = useState(false);
  const [channelTray, setChannelTray] = useState<"source" | "target" | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({ kind: "process", id: "rule" });
  const [draft, setDraft] = useState<FlowDraft>(defaultDraft);
  const [nodeConfigStore, setNodeConfigStore] = useState<Record<string, FlowNodeConfig>>(() => loadNodeConfigStore());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autosaveReadyRef = useRef(false);

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

  const sources = sourcesQuery.data?.channels ?? EMPTY_CHANNELS;
  const targets = targetsQuery.data?.channels ?? EMPTY_CHANNELS;
  const flows = flowsQuery.data?.flows ?? EMPTY_FLOWS;
  const filteredFlows = useMemo(() => {
    const query = flowSearch.trim().toLowerCase();
    if (!query) return flows;
    return flows.filter((flow) => [flow.name, flow.description ?? ""].join(" ").toLowerCase().includes(query));
  }, [flowSearch, flows]);
  const sourceById = useMemo(() => new Map(sources.map((channel) => [channel.id, channel])), [sources]);
  const targetById = useMemo(() => new Map(targets.map((channel) => [channel.id, channel])), [targets]);
  const selectedFlow = !isCreating && selectedFlowId ? flows.find((flow) => flow.id === selectedFlowId) ?? null : null;
  const flowKey = selectedFlow?.id ?? "new-flow";
  const nodeConfig = nodeConfigStore[flowKey] ?? defaultNodeConfig();
  const selectedSources = useMemo(() => draft.sourceChannelIds.flatMap((id) => {
    const channel = sourceById.get(id);
    return channel ? [channel] : [];
  }), [draft.sourceChannelIds, sourceById]);
  const selectedTargets = useMemo(() => draft.targetChannelIds.flatMap((id) => {
    const channel = targetById.get(id);
    return channel ? [channel] : [];
  }), [draft.targetChannelIds, targetById]);
  const selectedSource = selectedNode.kind === "source" ? sourceById.get(selectedNode.id) : undefined;
  const selectedTarget = selectedNode.kind === "target" ? targetById.get(selectedNode.id) : undefined;

  useEffect(() => {
    if (!isCreating && !selectedFlowId && flows.length > 0) {
      setSelectedFlowId(flows[0].id);
    }
  }, [flows, isCreating, selectedFlowId]);

  useEffect(() => {
    if (!selectedFlow) return;
    autosaveReadyRef.current = false;
    setDraft(readFlowDraft(selectedFlow));
    setSaveState("saved");
    window.setTimeout(() => {
      autosaveReadyRef.current = true;
    }, 0);
  }, [selectedFlow]);

  useEffect(() => {
    localStorage.setItem(NODE_CONFIG_STORAGE_KEY, JSON.stringify(nodeConfigStore));
  }, [nodeConfigStore]);

  useEffect(() => {
    if (!selectedFlow?.id || !autosaveReadyRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      persistFlow.mutate({ id: selectedFlow.id, draft });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, selectedFlow?.id]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["repost-flows"] });
  const persistFlow = useMutation({
    mutationFn: ({ id, draft: nextDraft }: { id: string; draft: FlowDraft }) => {
      const payload = {
        name: nextDraft.name.trim() || "Luồng chưa đặt tên",
        description: nextDraft.description.trim(),
        sourceChannelIds: nextDraft.sourceChannelIds,
        targetChannelIds: nextDraft.targetChannelIds,
        useAI: nextDraft.useAI,
        autoPublish: nextDraft.autoPublish,
        requireReview: nextDraft.requireReview,
        isActive: nextDraft.isActive
      };
      return apiPut<{ flow: RepostFlow }>(`/repost-flows/${id}`, payload);
    },
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
      setIsCreating(false);
      setSelectedFlowId(data.flow.id);
      setDraft(readFlowDraft(data.flow));
      setSelectedNode({ kind: "flow", id: "flow" });
      setChannelTray("source");
      setSaveState("saved");
      toast.success("Đã tạo luồng nháp.");
      await invalidate();
    },
    onError: (error) => toast.error(error.message)
  });
  const deleteFlow = useMutation({
    mutationFn: (id: string) => apiDelete(`/repost-flows/${id}`),
    onSuccess: async () => {
      setSelectedFlowId(null);
      setIsCreating(false);
      setDraft(defaultDraft());
      toast.success("Đã xóa flow.");
      await invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const startNewFlow = () => {
    setIsCreating(true);
    createFlow.mutate();
  };

  const selectFlow = (flow: RepostFlow) => {
    setIsCreating(false);
    setSelectedFlowId(flow.id);
    setSelectedNode({ kind: "process", id: "rule" });
    setChannelTray(null);
  };

  const updateNodeConfig = (updater: (current: FlowNodeConfig) => FlowNodeConfig) => {
    setNodeConfigStore((current) => ({
      ...current,
      [flowKey]: updater(current[flowKey] ?? defaultNodeConfig())
    }));
  };

  const toggleChannel = (kind: "source" | "target", id: string) => {
    const key = kind === "source" ? "sourceChannelIds" : "targetChannelIds";
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id]
    }));
  };

  const removeSelectedChannel = () => {
    if (selectedNode.kind !== "source" && selectedNode.kind !== "target") return;
    toggleChannel(selectedNode.kind, selectedNode.id);
    setSelectedNode({ kind: "process", id: "rule" });
  };

  const runRuleTest = () => {
    const result = evaluateRuleSample(nodeConfig.rule);
    updateNodeConfig((current) => ({ ...current, rule: { ...current.rule, testResult: result } }));
  };

  return (
    <div className="flow-automation-page">
      <PageHeader
        title="Flow Automation"
        subtitle="Quản lý nhiều luồng đăng lại. Mỗi luồng có kênh nguồn, bước xử lý và kênh đích riêng."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => { void sourcesQuery.refetch(); void targetsQuery.refetch(); void flowsQuery.refetch(); }}>
              Làm mới
            </Button>
            <Button variant="secondary" onClick={() => toast.info("Chạy thử sẽ kiểm tra luồng đang chọn bằng nội dung mẫu.")}>
              Chạy thử
            </Button>
            <Button icon={<Plus aria-hidden />} onClick={startNewFlow}>Tạo luồng</Button>
          </>
        }
      />

      <div className={`flow-automation-grid ${flowListCollapsed ? "flow-list-is-collapsed" : ""}`}>
        <aside className="flow-list-panel-v2">
          <div className="flow-panel-head">
            <div>
              <h2>Danh sách Flow</h2>
              {!flowListCollapsed ? <p>Mỗi flow có cấu hình nguồn, xử lý và đích riêng.</p> : null}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setFlowListCollapsed((current) => !current)}>
              {flowListCollapsed ? "›" : "‹"}
            </Button>
          </div>
          {!flowListCollapsed ? (
            <>
              <label className="flow-search-box">
                <Search aria-hidden />
                <Input value={flowSearch} onChange={(event) => setFlowSearch(event.target.value)} placeholder="Tìm flow, kênh hoặc ngành..." />
              </label>
              <div className="flow-list-scroll">
                {filteredFlows.length === 0 ? (
                  <EmptyState title="Chưa có luồng" description="Bấm Tạo luồng để tạo luồng đăng lại đầu tiên." />
                ) : null}
                {filteredFlows.map((flow) => (
                  <button
                    type="button"
                    key={flow.id}
                    className={`flow-list-card-v2 ${flow.id === selectedFlow?.id ? "active" : ""}`}
                    onClick={() => selectFlow(flow)}
                  >
                    <span className="flow-card-dot" />
                    <strong>{flow.name}</strong>
                    <small>{flow.description || "Chưa có mô tả"}</small>
                    <div className="flow-card-meta">
                      <Badge tone={flow.isActive ? "good" : "neutral"}>{flow.isActive ? "Đang bật" : "Tạm tắt"}</Badge>
                      <span>{flow.sources.length} nguồn · {PROCESS_STEPS.length} bước · {flow.targets.length} đích</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flow-list-mini">
              {filteredFlows.map((flow) => (
                <button type="button" key={flow.id} className={flow.id === selectedFlow?.id ? "active" : ""} onClick={() => selectFlow(flow)} title={flow.name}>
                  {flow.name.slice(0, 1).toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="flow-canvas-main-v2">
          <div className="flow-canvas-main-head">
            <div>
              <div className="flow-title-row">
                <h2>{draft.name || "Luồng mới"}</h2>
                <Badge tone={draft.isActive ? "good" : "neutral"}>{draft.isActive ? "Đang bật" : "Tạm tắt"}</Badge>
              </div>
              <p>Chọn từng khối để xem và chỉnh cấu hình ở bảng bên phải.</p>
            </div>
            <div className="flow-top-actions">
              <Button size="sm" variant="secondary" onClick={() => setSelectedNode({ kind: "flow", id: "flow" })}>Cấu hình luồng</Button>
              <Badge tone={saveState === "error" ? "danger" : saveState === "saving" ? "warn" : "neutral"}>
                {saveState === "saving" ? "Đang tự lưu" : saveState === "error" ? "Lưu lỗi" : "Đã tự lưu"}
              </Badge>
            </div>
          </div>

          <section className="flow-canvas-shell-v2">
            <div className="flow-canvas-toolbar">
              <div>
                <strong>Sơ đồ luồng đăng lại</strong>
                <span>Kéo nhìn tổng thể nguồn, xử lý và đích. Cấu hình chi tiết nằm ở bảng bên phải.</span>
              </div>
            </div>
            <div className="flow-board-v2">
              <div className="flow-board-column source">
                <div className="flow-board-column-head">
                  <strong>Kênh nguồn</strong>
                  <Button size="sm" variant={channelTray === "source" ? "primary" : "secondary"} icon={<Plus aria-hidden />} onClick={() => setChannelTray(channelTray === "source" ? null : "source")}>Thêm</Button>
                </div>
                {selectedSources.length === 0 ? (
                  <button type="button" className="flow-board-empty" onClick={() => setChannelTray("source")}>
                    Chưa chọn kênh nguồn. Bấm để thêm kênh.
                  </button>
                ) : selectedSources.map((channel) => (
                  <button
                    type="button"
                    key={channel.id}
                    className={`flow-board-card channel-card ${selectedNode.kind === "source" && selectedNode.id === channel.id ? "selected" : ""}`}
                    onClick={() => setSelectedNode({ kind: "source", id: channel.id })}
                  >
                    <span className="flow-node-dot" />
                    <strong>{channel.name}</strong>
                    <small>{platformLabel(channel.platform)} · {channel.account?.name ?? "Chưa rõ tài khoản"}</small>
                    <Badge tone={channel.isActive ? "good" : "neutral"}>{channel.isActive ? "Đang bật" : "Tạm tắt"}</Badge>
                  </button>
                ))}
              </div>

              <div className="flow-board-column process">
                <div className="flow-board-column-head">
                  <strong>Luồng xử lý</strong>
                </div>
                {PROCESS_STEPS.map((step, index) => (
                  <button
                    type="button"
                    key={step.id}
                    className={`flow-board-card process-card ${step.tone} ${selectedNode.kind === "process" && selectedNode.id === step.id ? "selected" : ""}`}
                    onClick={() => setSelectedNode({ kind: "process", id: step.id })}
                  >
                    <span className="flow-process-badge">{step.label.slice(0, 1)}</span>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                    {index < PROCESS_STEPS.length - 1 ? <i aria-hidden className="flow-step-arrow" /> : null}
                  </button>
                ))}
              </div>

              <div className="flow-board-column target">
                <div className="flow-board-column-head">
                  <strong>Kênh đích</strong>
                  <Button size="sm" variant={channelTray === "target" ? "primary" : "secondary"} icon={<Plus aria-hidden />} onClick={() => setChannelTray(channelTray === "target" ? null : "target")}>Thêm</Button>
                </div>
                {selectedTargets.length === 0 ? (
                  <button type="button" className="flow-board-empty" onClick={() => setChannelTray("target")}>
                    Chưa chọn kênh đích. Bấm để thêm kênh.
                  </button>
                ) : selectedTargets.map((channel) => (
                  <button
                    type="button"
                    key={channel.id}
                    className={`flow-board-card channel-card ${selectedNode.kind === "target" && selectedNode.id === channel.id ? "selected" : ""}`}
                    onClick={() => setSelectedNode({ kind: "target", id: channel.id })}
                  >
                    <span className="flow-node-dot" />
                    <strong>{channel.name}</strong>
                    <small>{platformLabel(channel.platform)} · {channel.account?.name ?? "Chưa rõ tài khoản"}</small>
                    <Badge tone={channel.filterMode === "category" ? "good" : "neutral"}>{channel.filterMode === "category" ? "Theo ngành" : "Nhận tất cả"}</Badge>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {channelTray ? (
            <section className="flow-channel-tray">
              <div className="flow-channel-tray-head">
                <div>
                  <strong>{channelTray === "source" ? "Chọn kênh nguồn" : "Chọn kênh đích"}</strong>
                  <span>Chọn các kênh sẽ tham gia luồng này.</span>
                </div>
                <Button size="sm" variant="ghost" icon={<X aria-hidden />} onClick={() => setChannelTray(null)}>Đóng</Button>
              </div>
              <div className="flow-channel-grid">
                {(channelTray === "source" ? sources : targets).map((channel) => {
                  const checked = channelTray === "source" ? draft.sourceChannelIds.includes(channel.id) : draft.targetChannelIds.includes(channel.id);
                  return (
                    <label key={channel.id} className={`channel-option-row ${checked ? "selected" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleChannel(channelTray, channel.id)} />
                      <span>
                        <strong>{channel.name}</strong>
                        <small>{platformLabel(channel.platform)} · {channel.account?.name ?? "Chưa rõ tài khoản"}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="flow-inspector-panel-v2">
          <div className="flow-inspector-head-v2">
            <div>
              <h2>Cấu hình</h2>
              <p>Đang chọn: {selectedNodeTitle(selectedNode, selectedSource, selectedTarget)}</p>
            </div>
            <Badge tone="neutral">{selectedFlow?.name ?? "Luồng mới"}</Badge>
          </div>
          {selectedNode.kind === "flow" ? (
            <FlowConfigInspector draft={draft} setDraft={setDraft} selectedFlow={selectedFlow} deleteFlow={deleteFlow} />
          ) : null}
          {selectedNode.kind === "source" && selectedSource ? (
            <ChannelInspector channel={selectedSource} kind="source" onRemove={removeSelectedChannel} />
          ) : null}
          {selectedNode.kind === "target" && selectedTarget ? (
            <ChannelInspector channel={selectedTarget} kind="target" onRemove={removeSelectedChannel} />
          ) : null}
          {selectedNode.kind === "process" ? (
            <ProcessInspector
              selected={selectedNode.id}
              config={nodeConfig}
              updateConfig={updateNodeConfig}
              onRunRuleTest={runRuleTest}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function FlowConfigInspector({
  draft,
  setDraft,
  selectedFlow,
  deleteFlow
}: {
  draft: FlowDraft;
  setDraft: Dispatch<SetStateAction<FlowDraft>>;
  selectedFlow: RepostFlow | null;
  deleteFlow: ReturnType<typeof useMutation<any, Error, string>>;
}) {
  return (
    <div className="flow-inspector-stack">
      <section className="flow-inspector-section">
        <h3>Thông tin luồng</h3>
        <label><Label>Tên flow</Label><Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><Label>Mô tả</Label><Textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
        <label><Label>Trạng thái</Label><Select value={String(draft.isActive)} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.value === "true" }))}><option value="true">Đang bật</option><option value="false">Tạm tắt</option></Select></label>
        <label><Label>Cách đăng</Label><Select value={draft.autoPublish && !draft.requireReview ? "auto" : "review"} onChange={(event) => setDraft((current) => ({ ...current, autoPublish: event.target.value === "auto", requireReview: event.target.value !== "auto" }))}><option value="review">Duyệt trước khi đăng</option><option value="auto">Tự động đăng</option></Select></label>
        {selectedFlow ? (
          <div className="flow-inspector-danger-zone">
            <strong>Vùng nguy hiểm</strong>
            <span>Xóa luồng sẽ gỡ cấu hình nguồn, xử lý và đích của luồng này.</span>
            <Button variant="danger" icon={<Trash2 aria-hidden />} onClick={() => deleteFlow.mutate(selectedFlow.id)} disabled={deleteFlow.isPending}>
              Xóa flow
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ChannelInspector({ channel, kind, onRemove }: { channel: PlatformChannel; kind: "source" | "target"; onRemove: () => void }) {
  return (
    <div className="flow-inspector-stack">
      <section className="flow-inspector-section">
        <h3>{kind === "source" ? "Kênh nguồn" : "Kênh đích"}</h3>
        <div className="flow-readonly-card">
          <strong>{channel.name}</strong>
          <span>{platformLabel(channel.platform)} · {channel.account?.name ?? "Chưa rõ tài khoản"}</span>
          <small>{channel.externalId}</small>
        </div>
        {kind === "target" ? (
          <div className="flow-readonly-grid">
            <div><span>Lọc nội dung</span><strong>{channel.filterMode === "category" ? "Theo ngành" : "Nhận tất cả"}</strong></div>
            <div><span>Nội dung tổng quát</span><strong>{channel.allowGeneralContent ? "Cho phép" : "Không"}</strong></div>
            <div><span>Ngành nhận</span><strong>{channel.acceptedCategories.length}</strong></div>
          </div>
        ) : null}
        <Button variant="danger" icon={<Trash2 aria-hidden />} onClick={onRemove}>
          Gỡ khỏi flow
        </Button>
      </section>
    </div>
  );
}

function ProcessInspector({
  selected,
  config,
  updateConfig,
  onRunRuleTest
}: {
  selected: ProcessNodeId;
  config: FlowNodeConfig;
  updateConfig: (updater: (current: FlowNodeConfig) => FlowNodeConfig) => void;
  onRunRuleTest: () => void;
}) {
  if (selected === "rule") {
    return <RuleInspector config={config.rule} updateConfig={updateConfig} onRunTest={onRunRuleTest} />;
  }
  if (selected === "collect") {
    return (
      <div className="flow-inspector-stack">
        <section className="flow-inspector-section">
          <h3>Thiết lập thu thập</h3>
          <ToggleRow label="Theo dõi realtime" checked={config.collect.realtime} onChange={(checked) => updateConfig((current) => ({ ...current, collect: { ...current.collect, realtime: checked } }))} />
          <ToggleRow label="Lấy media" checked={config.collect.includeMedia} onChange={(checked) => updateConfig((current) => ({ ...current, collect: { ...current.collect, includeMedia: checked } }))} />
          <ToggleRow label="Bỏ tin do chính account gửi" checked={config.collect.skipOwnMessages} onChange={(checked) => updateConfig((current) => ({ ...current, collect: { ...current.collect, skipOwnMessages: checked } }))} />
          <p className="table-subtle">Chu kỳ quét và số bài mỗi lần dùng mặc định hệ thống.</p>
        </section>
      </div>
    );
  }
  if (selected === "ai") {
    return (
      <div className="flow-inspector-stack">
        <section className="flow-inspector-section">
          <h3>Thiết lập AI</h3>
          <ToggleRow label="Bật AI" checked={config.ai.enabled} onChange={(checked) => updateConfig((current) => ({ ...current, ai: { ...current.ai, enabled: checked } }))} />
          <label><Label>Chế độ xử lý</Label><Select value={config.ai.mode} onChange={(event) => updateConfig((current) => ({ ...current, ai: { ...current.ai, mode: event.target.value as FlowNodeConfig["ai"]["mode"] } }))}><option value="classify_rewrite">Phân loại + viết lại</option><option value="classify_only">Chỉ phân loại</option><option value="rewrite_only">Chỉ viết lại</option></Select></label>
          <label><Label>Ngưỡng tin cậy</Label><Input type="number" step="0.01" min="0" max="1" value={config.ai.confidenceThreshold} onChange={(event) => updateConfig((current) => ({ ...current, ai: { ...current.ai, confidenceThreshold: Number(event.target.value) || 0.85 } }))} /></label>
          <label><Label>Khi độ tin cậy thấp</Label><Select value={config.ai.lowConfidenceAction} onChange={(event) => updateConfig((current) => ({ ...current, ai: { ...current.ai, lowConfidenceAction: event.target.value as "review" | "hold" } }))}><option value="review">Đưa vào hàng chờ duyệt</option><option value="hold">Giữ lại</option></Select></label>
          <label><Label>Xử lý ảnh bằng AI</Label><Select value={config.ai.visionMode} onChange={(event) => updateConfig((current) => ({ ...current, ai: { ...current.ai, visionMode: event.target.value as "off" | "review_only" } }))}><option value="off">Chưa bật</option><option value="review_only">Chỉ đánh dấu cần duyệt</option></Select></label>
        </section>
      </div>
    );
  }
  if (selected === "convert") {
    return (
      <div className="flow-inspector-stack">
        <section className="flow-inspector-section">
          <h3>Thiết lập đổi link</h3>
          <ToggleRow label="Bật convert affiliate" checked={config.convert.enabled} onChange={(checked) => updateConfig((current) => ({ ...current, convert: { ...current.convert, enabled: checked } }))} />
          <div className="flow-pill-grid">
            {["Shopee", "Lazada", "TikTok Shop", "AccessTrade"].map((network) => <CheckboxPill key={network} label={network} checked={config.convert.allowedNetworks.includes(network)} onChange={(checked) => updateConfig((current) => ({ ...current, convert: { ...current.convert, allowedNetworks: checked ? [...current.convert.allowedNetworks, network] : current.convert.allowedNetworks.filter((item) => item !== network) } }))} />)}
          </div>
          <label><Label>Khi đổi link lỗi</Label><Select value={config.convert.failedAction} onChange={(event) => updateConfig((current) => ({ ...current, convert: { ...current.convert, failedAction: event.target.value as "review" | "link_error" } }))}><option value="review">Đưa vào hàng chờ duyệt</option><option value="link_error">Đưa vào danh sách link lỗi</option></Select></label>
          <ToggleRow label="Giữ link gốc khi lỗi" checked={config.convert.keepOriginalOnFail} onChange={(checked) => updateConfig((current) => ({ ...current, convert: { ...current.convert, keepOriginalOnFail: checked } }))} />
        </section>
      </div>
    );
  }
  return (
    <div className="flow-inspector-stack">
      <section className="flow-inspector-section">
        <h3>Thiết lập chia kênh</h3>
        <label><Label>Ngưỡng tin cậy</Label><Input type="number" step="0.01" min="0" max="1" value={config.router.confidenceThreshold} onChange={(event) => updateConfig((current) => ({ ...current, router: { ...current.router, confidenceThreshold: Number(event.target.value) || 0.85 } }))} /></label>
        <label><Label>Khi độ tin cậy thấp</Label><Select value={config.router.lowConfidenceAction} onChange={(event) => updateConfig((current) => ({ ...current, router: { ...current.router, lowConfidenceAction: event.target.value as "review" | "hold" } }))}><option value="review">Đưa vào hàng chờ duyệt</option><option value="hold">Giữ lại</option></Select></label>
        <label><Label>Không có kênh đích phù hợp</Label><Select value={config.router.noMatchAction} onChange={(event) => updateConfig((current) => ({ ...current, router: { ...current.router, noMatchAction: event.target.value as "review" | "hold" } }))}><option value="review">Đưa vào hàng chờ duyệt</option><option value="hold">Giữ lại</option></Select></label>
        <label><Label>Nội dung tổng quát</Label><Select value={config.router.generalContentMode} onChange={(event) => updateConfig((current) => ({ ...current, router: { ...current.router, generalContentMode: event.target.value as FlowNodeConfig["router"]["generalContentMode"] } }))}><option value="allow_target_general">Gửi tới kênh cho phép nội dung tổng quát</option><option value="only_receive_all">Chỉ gửi tới kênh nhận tất cả</option></Select></label>
        <div className="flow-match-preview">
          <strong>Xem trước cách chia kênh</strong>
          <div><span>Mẹ & bé</span><b>0.93</b><Badge tone="good">Tự động</Badge></div>
          <div><span>Công nghệ</span><b>0.91</b><Badge tone="good">Tự động</Badge></div>
          <div><span>Làm đẹp</span><b>0.72</b><Badge tone="warn">Cần duyệt</Badge></div>
          <div><span>Chưa rõ</span><b>0.48</b><Badge tone="neutral">Giữ lại</Badge></div>
        </div>
      </section>
    </div>
  );
}

function RuleInspector({
  config,
  updateConfig,
  onRunTest
}: {
  config: RuleConfig;
  updateConfig: (updater: (current: FlowNodeConfig) => FlowNodeConfig) => void;
  onRunTest: () => void;
}) {
  const updateRule = (patch: Partial<RuleConfig>) => updateConfig((current) => ({ ...current, rule: { ...current.rule, ...patch } }));
  const toggleMethod = (method: string, checked: boolean) => updateRule({ duplicateMethods: checked ? [...config.duplicateMethods, method] : config.duplicateMethods.filter((item) => item !== method) });
  const toggleNetwork = (network: string, checked: boolean) => updateRule({ allowedNetworks: checked ? [...config.allowedNetworks, network] : config.allowedNetworks.filter((item) => item !== network) });

  return (
    <div className="flow-inspector-stack">
      <section className="flow-inspector-section">
        <h3>1. Lọc nội dung trùng</h3>
        <ToggleRow label="Bật lọc trùng" checked={config.duplicateEnabled} onChange={(checked) => updateRule({ duplicateEnabled: checked })} />
        <div className="flow-pill-grid">
          {[
            ["externalId", "Mã bài gốc"],
            ["normalized_url", "Link đã chuẩn hóa"],
            ["text_hash", "Nội dung giống nhau"],
            ["image_hash", "Ảnh giống nhau"]
          ].map(([method, label]) => <CheckboxPill key={method} label={label} checked={config.duplicateMethods.includes(method)} onChange={(checked) => toggleMethod(method, checked)} />)}
        </div>
        <label><Label>Kiểm tra trong</Label><Select value={config.lookbackDays} onChange={(event) => updateRule({ lookbackDays: event.target.value as RuleConfig["lookbackDays"] })}><option value="7">7 ngày</option><option value="14">14 ngày</option><option value="30">30 ngày</option></Select></label>
        <label><Label>Khi phát hiện trùng</Label><Select value={config.duplicateAction} onChange={(event) => updateRule({ duplicateAction: event.target.value as "skip" | "review" })}><option value="skip">Bỏ qua</option><option value="review">Đưa vào hàng chờ duyệt</option></Select></label>
      </section>

      <section className="flow-inspector-section">
        <h3>2. Link và domain</h3>
        <label><Label>Domain bỏ qua</Label><Textarea value={config.skipDomains} onChange={(event) => updateRule({ skipDomains: event.target.value })} /></label>
        <Label>Nền tảng được đổi link</Label>
        <div className="flow-pill-grid">
          {["Shopee", "Lazada", "TikTok Shop", "AccessTrade"].map((network) => <CheckboxPill key={network} label={network} checked={config.allowedNetworks.includes(network)} onChange={(checked) => toggleNetwork(network, checked)} />)}
        </div>
        <label><Label>Khi chỉ có link không dùng được</Label><Select value={config.junkOnlyAction} onChange={(event) => updateRule({ junkOnlyAction: event.target.value as "skip" | "review" })}><option value="skip">Bỏ qua</option><option value="review">Đưa vào hàng chờ duyệt</option></Select></label>
        <label><Label>Khi có link lỗi</Label><Select value={config.brokenLinkAction} onChange={(event) => updateRule({ brokenLinkAction: event.target.value as "review" | "link_error" })}><option value="review">Đưa vào hàng chờ duyệt</option><option value="link_error">Đưa vào danh sách link lỗi</option></Select></label>
      </section>

      <section className="flow-inspector-section">
        <h3>3. Nội dung bài viết</h3>
        <ToggleRow label="Cần keyword deal" checked={config.requireDealKeyword} onChange={(checked) => updateRule({ requireDealKeyword: checked })} />
        <label><Label>Keyword deal</Label><Textarea value={config.dealKeywords} onChange={(event) => updateRule({ dealKeywords: event.target.value })} /></label>
        <label><Label>Keyword cấm / spam</Label><Textarea value={config.bannedKeywords} onChange={(event) => updateRule({ bannedKeywords: event.target.value })} /></label>
        <label><Label>Bài không có link mua hàng</Label><Select value={config.noPurchaseLinkAction} onChange={(event) => updateRule({ noPurchaseLinkAction: event.target.value as "skip" | "review" })}><option value="skip">Bỏ qua</option><option value="review">Đưa vào hàng chờ duyệt</option></Select></label>
        <label><Label>Nội dung quá ngắn</Label><Select value={config.shortCommentAction} onChange={(event) => updateRule({ shortCommentAction: event.target.value as "skip" | "review" })}><option value="skip">Bỏ qua</option><option value="review">Đưa vào hàng chờ duyệt</option></Select></label>
      </section>

      <section className="flow-inspector-section">
        <h3>4. Ảnh và video</h3>
        <ToggleRow label="Cho phép ảnh/video" checked={config.allowMedia} onChange={(checked) => updateRule({ allowMedia: checked })} />
        <label><Label>Chỉ có ảnh, không có chữ</Label><Select value={config.imageOnlyAction} onChange={(event) => updateRule({ imageOnlyAction: event.target.value as RuleConfig["imageOnlyAction"] })}><option value="review">Đưa vào hàng chờ duyệt</option><option value="ocr">Đọc chữ trong ảnh</option><option value="skip">Bỏ qua</option></Select></label>
        <label><Label>Ảnh cần AI kiểm tra thêm</Label><Select value={config.visionSuspectAction} onChange={() => updateRule({ visionSuspectAction: "review" })}><option value="review">Đưa vào hàng chờ duyệt</option></Select></label>
      </section>

      <section className="flow-inspector-section">
        <h3>5. Kết quả mặc định</h3>
        <label><Label>Nếu không vướng luật nào</Label><Select value={config.defaultAction} onChange={(event) => updateRule({ defaultAction: event.target.value as RuleConfig["defaultAction"] })}><option value="process">Cho xử lý tiếp</option><option value="skip">Bỏ qua</option><option value="review">Đưa vào hàng chờ duyệt</option><option value="link_error">Đưa vào danh sách link lỗi</option><option value="hold">Giữ lại</option></Select></label>
      </section>

      <section className="flow-inspector-section rule-test-section">
        <h3>6. Chạy thử bộ lọc</h3>
        <Textarea value={config.sampleContent} onChange={(event) => updateRule({ sampleContent: event.target.value })} placeholder="Dán một bài mẫu để kiểm tra..." />
        <div className="actions">
          <Button variant="secondary" onClick={onRunTest}>Chạy thử</Button>
        </div>
        {config.testResult ? (
          <div className={`rule-test-result ${config.testResult.action}`}>
            <strong>Kết quả: {translateRuleAction(config.testResult.action)}</strong>
            {config.testResult.reasons.map((reason) => <span key={reason}>{reason}</span>)}
            <small>Luật đã khớp: {config.testResult.matchedRules.map(translateMatchedRule).join(", ")}</small>
          </div>
        ) : null}
      </section>
    </div>
  );
}
