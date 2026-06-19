import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clipboard, ExternalLink, Play, RefreshCw, RotateCcw, Square } from "lucide-react";
import { apiAssetUrl, apiGet, apiPost, apiPostForm } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { FileUploadDropzone } from "../components/common/FileUploadDropzone";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";

type DetectedLink = {
  originalUrl: string;
  network: string;
  action: string;
  reason?: string;
};

type ConvertResult = {
  originalUrl: string;
  convertedUrl?: string;
  failureReason?: string;
};

type DirectTab = "direct" | "batch";
type OutputType = "shortlink" | "full";
type BrowserJobStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "waiting_captcha"
  | "login_required"
  | "manual_required"
  | "cancelled";

type BrowserConvertJob = {
  jobId: string;
  platform: string;
  originalUrl: string;
  convertedUrl: string | null;
  subId: string;
  subIds: string[];
  outputType: OutputType;
  status: BrowserJobStatus;
  errorCode: string | null;
  errorMessage: string | null;
  screenshotPath: string | null;
  retryable: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
};

type BrowserSessionStatus = {
  browserName: "Zerun Controlled Browser - Shopee Main";
  accountId: "shopee-main";
  status: string;
  currentUrl: string | null;
  lastHealthCheckAt: string | null;
  lastError: string | null;
  lastScreenshotPath: string | null;
  queueStatus: {
    runningJobId: string | null;
    queuedJobIds: string[];
    queuedCount: number;
    paused: boolean;
  };
  profilePath: string;
  browserPid: number | null;
  pageName: "Shopee Affiliate Converter Page";
  captchaLoginState: "waiting_captcha" | "login_required" | null;
};

const terminalStatuses = new Set<BrowserJobStatus>(["success", "failed", "manual_required", "cancelled"]);
const actionRequiredStatuses = new Set<BrowserJobStatus>(["waiting_captcha", "login_required"]);

function isShopeeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "shopee.vn"
      || host.endsWith(".shopee.vn")
      || host === "s.shopee.vn"
      || host === "shopee.ee"
      || host.includes("shopee.");
  } catch {
    return false;
  }
}

function sanitizeSubId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function buildFinalSubId(subIds: string[]) {
  return subIds.map(sanitizeSubId).filter(Boolean).join("-");
}

function resolveAssetPath(path: string | null | undefined) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/v1/")) return apiAssetUrl(path.replace(/^\/api\/v1/, ""));
  return apiAssetUrl(path);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

function statusTone(status: string): "neutral" | "good" | "warn" | "danger" {
  if (status === "success" || status === "ready") return "good";
  if (status === "failed" || status === "error" || status === "login_required") return "danger";
  if (status === "waiting_captcha" || status === "queued" || status === "running" || status === "busy" || status === "starting") return "warn";
  return "neutral";
}

function MetadataField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="metadata-field">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export function ConvertLinkToolPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DirectTab>("direct");
  const [step, setStep] = useState(1);
  const [text, setText] = useState("");
  const [subIds, setSubIds] = useState(["", "", "", "", ""]);
  const [batchId, setBatchId] = useState("");
  const [links, setLinks] = useState<DetectedLink[]>([]);
  const [batchFile, setBatchFile] = useState<{ fileUrl: string; filename: string } | null>(null);
  const [results, setResults] = useState<ConvertResult[]>([]);
  const [outputMode, setOutputMode] = useState<"text" | "xlsx">("text");
  const [finalOutput, setFinalOutput] = useState<{ text?: string; fileUrl?: string; filename?: string } | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [directUrl, setDirectUrl] = useState("");
  const [outputType, setOutputType] = useState<OutputType>("shortlink");
  const [currentJobId, setCurrentJobId] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [directError, setDirectError] = useState("");

  const finalSubIdPreview = useMemo(() => buildFinalSubId(subIds), [subIds]);

  const sessionQuery = useQuery({
    queryKey: ["browser-session", "shopee-main"],
    queryFn: () => apiGet<BrowserSessionStatus>("/browser-sessions/shopee-main"),
    refetchInterval: 5_000
  });

  const jobQuery = useQuery({
    queryKey: ["browser-convert-job", currentJobId],
    queryFn: () => apiGet<BrowserConvertJob>(`/tools/convert-link/browser-convert/${currentJobId}`),
    enabled: Boolean(currentJobId),
    refetchInterval: (query) => {
      const job = query.state.data as BrowserConvertJob | undefined;
      return job && (terminalStatuses.has(job.status) || actionRequiredStatuses.has(job.status)) ? false : 2_000;
    }
  });

  const browserJob = jobQuery.data ?? null;
  const session = sessionQuery.data ?? null;

  useEffect(() => {
    setCopyMessage("");
  }, [browserJob?.convertedUrl]);

  const detectMutation = useMutation({
    mutationFn: async () => {
      if (sourceFile) {
        const body = new FormData();
        body.append("file", sourceFile);
        body.append("text", text);
        body.append("subIds", JSON.stringify(subIds));
        return apiPostForm<{ links: DetectedLink[]; batchId: string }>("/tools/convert-link/detect", body);
      }
      return apiPost<{ links: DetectedLink[]; batchId: string }>("/tools/convert-link/detect", { text, subIds });
    },
    onSuccess: (data) => {
      setLinks(data.links);
      setBatchId(data.batchId);
      setStep(2);
    },
    onError: (error) => toast.error(error.message)
  });

  const exportMutation = useMutation({
    mutationFn: () => apiPost<{ fileUrl: string; filename: string }>("/tools/convert-link/export-batch", { batchId }),
    onSuccess: (data) => setBatchFile(data),
    onError: (error) => toast.error(error.message)
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (resultFile) {
        const body = new FormData();
        body.append("batchId", batchId);
        body.append("file", resultFile);
        return apiPostForm<{ results: ConvertResult[] }>("/tools/convert-link/import-result", body);
      }
      return apiPost<{ results: ConvertResult[] }>("/tools/convert-link/import-result", { batchId, csvText: "" });
    },
    onSuccess: (data) => {
      setResults(data.results);
      setStep(3);
    },
    onError: (error) => toast.error(error.message)
  });

  const applyMutation = useMutation({
    mutationFn: () => apiPost<{ text?: string; fileUrl?: string; filename?: string }>("/tools/convert-link/apply-result", { batchId, output: outputMode }),
    onSuccess: (data) => setFinalOutput(data),
    onError: (error) => toast.error(error.message)
  });

  const createBrowserJobMutation = useMutation({
    mutationFn: () => {
      const url = directUrl.trim();
      if (!url) throw new Error("URL cần convert không được để trống.");
      if (!isShopeeUrl(url)) throw new Error("Chỉ chấp nhận link Shopee, s.shopee.vn hoặc shopee.ee.");
      return apiPost<{ jobId: string; status: BrowserJobStatus; message: string }>("/tools/convert-link/browser-convert", {
        platform: "shopee",
        url,
        subIds,
        outputType,
        accountId: "shopee-main",
        mode: "browser_ui_convert",
        source: "convert_link_tool"
      });
    },
    onSuccess: (data) => {
      setCurrentJobId(data.jobId);
      setDirectError("");
      setCopyMessage("");
      void queryClient.invalidateQueries({ queryKey: ["browser-session", "shopee-main"] });
      toast.success("Đã tạo job convert qua Shopee Browser.");
    },
    onError: (error) => {
      setDirectError(error.message);
      toast.error(error.message);
    }
  });

  const sessionActionMutation = useMutation({
    mutationFn: (action: "start" | "stop" | "restart" | "open" | "mark-resolved") =>
      apiPost<BrowserSessionStatus>(`/browser-sessions/shopee-main/${action}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["browser-session", "shopee-main"] });
      if (currentJobId) void queryClient.invalidateQueries({ queryKey: ["browser-convert-job", currentJobId] });
    },
    onError: (error) => toast.error(error.message)
  });

  const retryJobMutation = useMutation({
    mutationFn: () => apiPost<{ jobId: string; status: BrowserJobStatus; message: string }>(`/tools/convert-link/browser-convert/${currentJobId}/retry`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["browser-convert-job", currentJobId] });
      void queryClient.invalidateQueries({ queryKey: ["browser-session", "shopee-main"] });
      toast.success("Đã đưa job vào hàng chờ retry.");
    },
    onError: (error) => toast.error(error.message)
  });

  const cancelJobMutation = useMutation({
    mutationFn: () => apiPost<{ jobId: string; status: BrowserJobStatus; message: string }>(`/tools/convert-link/browser-convert/${currentJobId}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["browser-convert-job", currentJobId] });
      void queryClient.invalidateQueries({ queryKey: ["browser-session", "shopee-main"] });
      toast.success("Đã hủy job convert link.");
    },
    onError: (error) => toast.error(error.message)
  });

  const updateSubId = (index: number, value: string) => {
    setSubIds((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  };

  const handleDirectConvert = () => {
    setDirectError("");
    createBrowserJobMutation.mutate();
  };

  const handleCopy = async () => {
    if (!browserJob?.convertedUrl) return;
    try {
      await navigator.clipboard.writeText(browserJob.convertedUrl);
      setCopyMessage("Đã copy link");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không copy được link.");
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Convert link affiliate"
        subtitle="Zerun Admin Browser chỉ mở dashboard; Shopee/Affiliate chạy trong Zerun Controlled Browser - Shopee Main do backend mở riêng."
      />

      <div className="tabs">
        <button type="button" className={activeTab === "direct" ? "active" : ""} onClick={() => setActiveTab("direct")}>
          Convert trực tiếp
        </button>
        <button type="button" className={activeTab === "batch" ? "active" : ""} onClick={() => setActiveTab("batch")}>
          Batch thủ công
        </button>
      </div>

      {activeTab === "direct" ? (
        <>
          <SectionCard title="Convert trực tiếp qua Browser">
            <div className="form-grid">
              <label>
                <Label>Nền tảng</Label>
                <Select value="shopee" disabled>
                  <option value="shopee">Shopee</option>
                  <option value="lazada" disabled>Lazada (coming soon)</option>
                  <option value="tiktok_shop" disabled>TikTok Shop (coming soon)</option>
                </Select>
              </label>
              <label>
                <Label>Kiểu link kết quả</Label>
                <Select value={outputType} onChange={(event) => setOutputType(event.target.value as OutputType)}>
                  <option value="shortlink">Shortlink</option>
                  <option value="full">Full affiliate link</option>
                </Select>
              </label>
              <label className="span-2">
                <Label>URL cần convert</Label>
                <Input
                  value={directUrl}
                  onChange={(event) => setDirectUrl(event.target.value)}
                  placeholder="Dán link Shopee / s.shopee.vn / shopee.vn/..."
                />
              </label>
              {subIds.map((subId, index) => (
                <label key={index}>
                  <Label>{`Sub_id${index + 1}`}</Label>
                  <Input value={subId} onChange={(event) => updateSubId(index, event.target.value)} />
                </label>
              ))}
            </div>
            <div className="direct-subid-preview">
              <span>Sub ID gửi đi</span>
              <code className="code-inline">{finalSubIdPreview || "-"}</code>
            </div>
            {directError ? <p className="form-error-text">{directError}</p> : null}
            <div className="actions" style={{ marginTop: 16 }}>
              <Button icon={<Play size={16} aria-hidden />} onClick={handleDirectConvert} disabled={createBrowserJobMutation.isPending || !directUrl.trim()}>
                Convert qua Shopee Browser
              </Button>
              {browserJob && !terminalStatuses.has(browserJob.status) ? (
                <Button variant="outline" icon={<Square size={15} aria-hidden />} onClick={() => cancelJobMutation.mutate()} disabled={cancelJobMutation.isPending}>
                  Cancel Job
                </Button>
              ) : null}
              {browserJob ? <Badge tone={statusTone(browserJob.status)}>Job: {browserJob.status}</Badge> : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Zerun Controlled Browser - Shopee Main"
            actions={(
              <>
                <Button variant="outline" size="sm" onClick={() => sessionActionMutation.mutate("start")} disabled={sessionActionMutation.isPending}>Start Browser</Button>
                <Button variant="outline" size="sm" onClick={() => sessionActionMutation.mutate("stop")} disabled={sessionActionMutation.isPending}>Stop Browser</Button>
                <Button variant="outline" size="sm" icon={<RefreshCw size={14} aria-hidden />} onClick={() => sessionActionMutation.mutate("restart")} disabled={sessionActionMutation.isPending}>Restart Browser</Button>
              </>
            )}
          >
            <div className="browser-session-grid">
              <MetadataField label="Status" value={session?.status ?? sessionQuery.fetchStatus} />
              <MetadataField label="Account ID" value={session?.accountId ?? "shopee-main"} />
              <MetadataField label="Profile path" value={session?.profilePath ?? "-"} />
              <MetadataField label="Current URL" value={session?.currentUrl ?? "-"} />
              <MetadataField label="Queue running job" value={session?.queueStatus.runningJobId ?? "-"} />
              <MetadataField label="Last screenshot" value={session?.lastScreenshotPath ?? "-"} />
              <MetadataField label="Last error" value={session?.lastError ?? "-"} />
              <MetadataField label="Last health check" value={formatDate(session?.lastHealthCheckAt)} />
              <MetadataField label="Captcha/login state" value={session?.captchaLoginState ?? "-"} />
            </div>
            <div className="actions" style={{ marginTop: 16 }}>
              <Button variant="secondary" icon={<ExternalLink size={15} aria-hidden />} onClick={() => sessionActionMutation.mutate("open")} disabled={sessionActionMutation.isPending}>
                Open Controlled Browser
              </Button>
              <Button variant="outline" onClick={() => sessionActionMutation.mutate("mark-resolved")} disabled={sessionActionMutation.isPending}>
                Mark Captcha Resolved
              </Button>
              <Button variant="outline" onClick={handleDirectConvert} disabled={createBrowserJobMutation.isPending || !directUrl.trim()}>
                Test Convert Link
              </Button>
              {session?.lastScreenshotPath ? (
                <Button asChild variant="link">
                  <a href={resolveAssetPath(session.lastScreenshotPath)} target="_blank" rel="noreferrer">Mở screenshot</a>
                </Button>
              ) : null}
            </div>
          </SectionCard>

          {browserJob ? (
            <SectionCard title="Kết quả convert">
              <div className="result-fields">
                <MetadataField label="Nền tảng" value="Shopee" />
                <MetadataField label="Link gốc" value={browserJob.originalUrl} />
                <MetadataField label="Sub ID" value={browserJob.subId || "-"} />
                <MetadataField label="Trạng thái" value={browserJob.status} />
                <MetadataField label="Link đã convert" value={browserJob.convertedUrl ?? "-"} />
              </div>

              {browserJob.status === "success" && browserJob.convertedUrl ? (
                <div className="result-output">
                  <Textarea readOnly value={browserJob.convertedUrl} />
                  <div className="actions">
                    <Button icon={<Clipboard size={15} aria-hidden />} onClick={handleCopy}>Copy link</Button>
                    {copyMessage ? <span className="copy-success"><Check size={15} aria-hidden />{copyMessage}</span> : null}
                  </div>
                </div>
              ) : null}

              {browserJob.status === "failed" || browserJob.status === "manual_required" ? (
                <div className="error-panel">
                  <MetadataField label="errorCode" value={browserJob.errorCode ?? "-"} />
                  <MetadataField label="errorMessage" value={browserJob.errorMessage ?? "-"} />
                </div>
              ) : null}

              {actionRequiredStatuses.has(browserJob.status) ? (
                <div className="warning-panel">
                  <p>Shopee cần admin xử lý captcha/login trong Zerun Controlled Browser - Shopee Main.</p>
                  <div className="actions">
                    <Button variant="secondary" icon={<ExternalLink size={15} aria-hidden />} onClick={() => sessionActionMutation.mutate("open")} disabled={sessionActionMutation.isPending}>
                      Open Controlled Browser
                    </Button>
                    <Button variant="outline" onClick={() => sessionActionMutation.mutate("mark-resolved")} disabled={sessionActionMutation.isPending}>
                      Mark Resolved
                    </Button>
                    <Button variant="outline" icon={<RotateCcw size={15} aria-hidden />} onClick={() => retryJobMutation.mutate()} disabled={retryJobMutation.isPending}>
                      Retry Job
                    </Button>
                  </div>
                </div>
              ) : null}

              {browserJob.screenshotPath ? (
                <div className="screenshot-preview">
                  <a href={resolveAssetPath(browserJob.screenshotPath)} target="_blank" rel="noreferrer">Mở screenshot lỗi</a>
                  <img src={resolveAssetPath(browserJob.screenshotPath)} alt="Screenshot Shopee khi convert lỗi" />
                </div>
              ) : null}
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {activeTab === "batch" ? (
        <>
          <div className="stepper">
            {["Tạo file convert", "Nhập kết quả convert", "Xuất kết quả"].map((label, index) => (
              <button key={label} type="button" className={step === index + 1 ? "active" : ""} onClick={() => setStep(index + 1)}>
                {index + 1}. {label}
              </button>
            ))}
          </div>

          {step === 1 ? (
            <SectionCard title="1. Tạo file convert">
              <div className="form-grid">
                <label className="span-2">
                  <Label>Nội dung cần detect link</Label>
                  <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Dán nội dung tiếng Việt có link Shopee/Lazada hoặc link cần kiểm tra..." />
                </label>
                <div className="span-2">
                  <FileUploadDropzone label="Hoặc upload Excel/CSV" accept=".xlsx,.xls,.csv,.txt" onChange={(files) => setSourceFile(files[0] ?? null)} />
                  {sourceFile ? <p className="table-subtle">Đã chọn: {sourceFile.name}</p> : null}
                </div>
                {subIds.map((subId, index) => (
                  <label key={index}>
                    <Label>{`Sub_id${index + 1}`}</Label>
                    <Input value={subId} onChange={(event) => updateSubId(index, event.target.value)} />
                  </label>
                ))}
              </div>
              <div className="actions" style={{ marginTop: 16 }}>
                <Button onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending || (!text.trim() && !sourceFile)}>Detect links</Button>
              </div>
            </SectionCard>
          ) : null}

          {links.length > 0 ? (
            <SectionCard title="Link đã phát hiện" actions={<Button variant="secondary" onClick={() => exportMutation.mutate()} disabled={!batchId}>Download Batch Custom Links.xlsx</Button>}>
              {batchFile ? <p><a href={batchFile.fileUrl}>{batchFile.filename}</a></p> : null}
              <AdminDataTable
                rows={links}
                getRowKey={(row) => row.originalUrl}
                columns={[
                  { key: "url", header: "Liên kết gốc", render: (row) => row.originalUrl },
                  { key: "network", header: "Network", render: (row) => row.network },
                  { key: "action", header: "Action", render: (row) => row.action },
                  { key: "reason", header: "Ghi chú", render: (row) => row.reason ?? "Có thể convert" }
                ]}
              />
            </SectionCard>
          ) : null}

          {step === 2 ? (
            <SectionCard title="2. Nhập CSV kết quả convert">
              <FileUploadDropzone label="Upload AffiliateBatchCustomLinks CSV" accept=".csv,.xlsx,.xls" onChange={(files) => setResultFile(files[0] ?? null)} />
              {resultFile ? <p className="table-subtle">Đã chọn: {resultFile.name}</p> : null}
              <div className="actions" style={{ marginTop: 16 }}>
                <Button onClick={() => importMutation.mutate()} disabled={!batchId || !resultFile || importMutation.isPending}>Parse kết quả</Button>
              </div>
            </SectionCard>
          ) : null}

          {results.length > 0 ? (
            <SectionCard title="Preview kết quả convert">
              <AdminDataTable
                rows={results}
                getRowKey={(row) => row.originalUrl}
                columns={[
                  { key: "original", header: "Liên kết gốc", render: (row) => row.originalUrl },
                  { key: "converted", header: "Liên kết chuyển đổi", render: (row) => row.convertedUrl ?? "-" },
                  { key: "reason", header: "Lí do thất bại", render: (row) => row.failureReason ?? "-" }
                ]}
              />
            </SectionCard>
          ) : null}

          {step === 3 ? (
            <SectionCard title="3. Xuất kết quả cuối">
              <div className="form-grid">
                <label>
                  <Label>Định dạng output</Label>
                  <Select value={outputMode} onChange={(event) => setOutputMode(event.target.value as "text" | "xlsx")}>
                    <option value="text">Text</option>
                    <option value="xlsx">Excel</option>
                  </Select>
                </label>
              </div>
              <div className="actions" style={{ marginTop: 16 }}>
                <Button onClick={() => applyMutation.mutate()} disabled={!batchId || applyMutation.isPending}>Thay link và xuất kết quả</Button>
              </div>
              {finalOutput?.text ? <Textarea readOnly value={finalOutput.text} style={{ marginTop: 16 }} /> : null}
              {finalOutput?.fileUrl ? <p><a href={finalOutput.fileUrl}>{finalOutput.filename}</a></p> : null}
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
