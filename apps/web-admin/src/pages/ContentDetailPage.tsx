import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Save, Send, Trash2, XCircle } from "lucide-react";
import { apiGet, apiPost, apiPostForm, apiPut } from "../api/client";
import { FileUploadDropzone } from "../components/common/FileUploadDropzone";
import { MediaPathInput } from "../components/common/MediaPathInput";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import { SectionCard } from "../components/common/SectionCard";
import { PageHeader } from "../components/common/PageHeader";
import { ThreadsPublishSettings, buildThreadsPublishPayload, normalizeThreadsPublishSettings, type ThreadsPublishSettingsValue } from "../components/common/ThreadsPublishSettings";
import { getPlatformLabel, isSupportedTargetPlatform } from "../utils/platforms";
import type { ContentPackageMetadata } from "./repostTypes";

type AiAnalysis = {
  shouldSave?: boolean;
  shouldPublish?: boolean;
  requireReview?: boolean;
  messageType?: string;
  platform?: string;
  productName?: string;
  shortTitle?: string;
  price?: string;
  discount?: string;
  voucherCode?: string;
  rewrittenText?: string;
  reason?: string;
  confidence?: number;
};

type AiMeta = {
  analysis?: AiAnalysis;
  decision?: { status?: string; autoPublish?: boolean; reason?: string };
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
};

type ContentDetail = {
  id: string;
  code: string;
  platform: string;
  status: string;
  originalText: string;
  draftText?: string;
  finalText?: string;
  scheduledTargets?: string[];
  metadata?: unknown;
  links: Array<{ id: string; originalUrl: string; convertedUrl?: string; network: string; status: string; error?: string }>;
  media: Array<{ id: string; type: string; sourceUrl?: string }>;
  publishAttempts: Array<{
    id: string;
    status: string;
    resultUrl?: string;
    error?: string;
    createdAt: string;
    targetId?: string;
    target?: { platform?: string; name?: string };
  }>;
  source?: { id: string; name: string; platform: string; handle?: string | null } | null;
};

type DetailData = { content: ContentDetail };

type AccountsData = {
  accounts: Array<{ id: string; name: string; platform: string; kind: string }>;
};

type ContentMetadata = {
  type?: string;
  comment?: string;
  mediaPaths?: string[];
  threads?: Partial<ThreadsPublishSettingsValue>;
  ai?: AiMeta;
  contentPackage?: ContentPackageMetadata;
  sourceChannelId?: string | null;
  sourceChannelName?: string | null;
};

function getMetadata(content: ContentDetail): ContentMetadata {
  const raw = content.metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as ContentMetadata;
  return {};
}

function postTypesForPlatform(platform: string): Array<{ value: string; label: string }> {
  if (platform === "threads") return [{ value: "feed", label: "Feed" }];
  return [
    { value: "feed", label: "Feed" },
    { value: "story", label: "Story" },
    { value: "reel", label: "Reel" }
  ];
}

function formatSourceTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("vi-VN");
}

function SourcePackageSection({
  content,
  metadata,
  expanded,
  onToggle
}: {
  content: ContentDetail;
  metadata: ContentMetadata;
  expanded: boolean;
  onToggle: () => void;
}) {
  const contentPackage = metadata.contentPackage;
  const rawMessages = contentPackage?.rawMessages ?? [];
  const rawMessageIds = contentPackage?.rawMessageIds ?? [];
  const rawCount = rawMessages.length || rawMessageIds.length || 1;
  const mediaCount = contentPackage?.mediaCount ?? content.media.length;
  const linkCount = contentPackage?.linkCount ?? content.links.length;
  const confidence = typeof contentPackage?.confidence === "number" ? `${Math.round(contentPackage.confidence)}%` : "-";
  const sourceName = metadata.sourceChannelName ?? content.source?.name ?? getPlatformLabel(content.platform);
  const hasRawMessages = rawMessages.length > 0;

  return (
    <SectionCard
      title="Thông tin nguồn"
      description="Xem content package đã được gom từ các tin nhắn nguồn trước khi export thành nội dung reup."
      actions={
        <Button variant="secondary" size="sm" onClick={onToggle}>
          {expanded ? "Ẩn chi tiết" : "Xem chi tiết"}
        </Button>
      }
    >
      <div className="source-package-summary">
        <div>
          <span>Nguồn</span>
          <strong>{sourceName}</strong>
        </div>
        <div>
          <span>Package</span>
          <strong>{rawCount} tin nhắn</strong>
        </div>
        <div>
          <span>Media</span>
          <strong>{mediaCount}</strong>
        </div>
        <div>
          <span>Link</span>
          <strong>{linkCount}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{confidence}</strong>
        </div>
      </div>

      {contentPackage?.groupingReason ? (
        <div className="source-package-note">Gom tin: {contentPackage.groupingReason}</div>
      ) : null}

      {expanded ? (
        <div className="source-message-list">
          {hasRawMessages ? rawMessages.map((message, index) => (
            <article className="source-message-card" key={message.id ?? `${content.id}-${index}`}>
              <div className="source-message-head">
                <div>
                  <strong>{message.senderName ?? message.senderId ?? `Tin nhắn ${index + 1}`}</strong>
                  <span>{formatSourceTime(message.createdAt)} · ID: {message.externalId ?? message.id}</span>
                </div>
                <Badge tone={message.mediaCount ? "good" : "neutral"}>{message.mediaCount ?? 0} media</Badge>
              </div>
              {message.text ? (
                <pre className="source-message-text">{message.text}</pre>
              ) : (
                <p className="table-subtle">Tin nhắn này không có text, chỉ có media hoặc metadata.</p>
              )}
              {message.links?.length ? (
                <div className="source-message-links">
                  {message.links.map((link) => (
                    <a key={link} href={link} target="_blank" rel="noopener noreferrer">{link}</a>
                  ))}
                </div>
              ) : null}
            </article>
          )) : (
            <article className="source-message-card">
              <div className="source-message-head">
                <div>
                  <strong>Nội dung đã gom</strong>
                  <span>{rawMessageIds.length ? rawMessageIds.join(", ") : content.code}</span>
                </div>
                <Badge tone="neutral">Fallback</Badge>
              </div>
              <pre className="source-message-text">{content.originalText}</pre>
            </article>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}

export function ContentDetailPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const detail = useQuery({
    queryKey: ["content", code],
    queryFn: () => apiGet<DetailData>(`/contents/${code}`),
    enabled: Boolean(code)
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<AccountsData>("/accounts")
  });

  const content = detail.data?.content;
  const metadata = content ? getMetadata(content) : {};
  const allTargetAccounts = (accountsQuery.data?.accounts ?? []).filter((a) => a.kind === "target");
  const relevantTargets = allTargetAccounts.filter((a) =>
    content?.platform && isSupportedTargetPlatform(content.platform) ? a.platform === content.platform : isSupportedTargetPlatform(a.platform)
  );

  const [draftText, setDraftText] = useState<string | undefined>(undefined);
  const [postType, setPostType] = useState<string | undefined>(undefined);
  const [comment, setComment] = useState<string | undefined>(undefined);
  const [mediaPaths, setMediaPaths] = useState<string[] | undefined>(undefined);
  const [threads, setThreads] = useState<ThreadsPublishSettingsValue | undefined>(undefined);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>(undefined);
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({});
  const [showSourcePackage, setShowSourcePackage] = useState(false);

  const effectiveDraftText = draftText ?? content?.draftText ?? content?.originalText ?? "";
  const effectivePostType = postType ?? metadata.type ?? "feed";
  const effectiveComment = comment ?? metadata.comment ?? "";
  const effectiveMediaPaths = mediaPaths ?? metadata.mediaPaths ?? [];
  const effectiveThreads = threads ?? normalizeThreadsPublishSettings(metadata.threads);
  const defaultTargetId = content?.scheduledTargets?.[0] ?? relevantTargets[0]?.id ?? "";
  const effectiveTargetId = selectedTargetId ?? defaultTargetId;
  const platformLabel = getPlatformLabel(content?.platform ?? "facebook");
  const postTypeOptions = postTypesForPlatform(content?.platform ?? "facebook");
  const isThreadsContent = content?.platform === "threads" || relevantTargets.find((account) => account.id === effectiveTargetId)?.platform === "threads";

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const data = await apiPostForm<{ file: { filename: string; localPath: string; mimeType: string } }>("/uploads/manual", body);
      return data.file;
    },
    onSuccess: (file) => {
      setMediaPaths((current) => [...(current ?? effectiveMediaPaths), file.localPath]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể upload file.");
    }
  });

  const saveMutation = useMutation({
    mutationFn: () => apiPut(`/contents/${code}/edit`, {
      draftText: effectiveDraftText,
      type: effectivePostType,
      comment: effectiveComment,
      mediaPaths: effectiveMediaPaths,
      threads: isThreadsContent ? buildThreadsPublishPayload(effectiveThreads) : undefined,
      targetIds: effectiveTargetId ? [effectiveTargetId] : []
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
      navigate(-1);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể lưu.");
    }
  });

  const publishMutation = useMutation({
    mutationFn: () => apiPost<{ queued: boolean; targetCount: number }>(`/contents/${code}/publish`, {
      targetIds: effectiveTargetId ? [effectiveTargetId] : []
    }),
    onSuccess: (data) => {
      toast.success(`Đã đưa vào hàng chờ đăng cho ${data.targetCount} tài khoản.`);
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["content", code] }), 2000);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể đăng bài.");
    }
  });

  const manualLinkMutation = useMutation({
    mutationFn: () => {
      const links = Object.entries(manualLinks)
        .filter(([, v]) => v.trim())
        .map(([originalUrl, convertedUrl]) => ({ originalUrl, convertedUrl: convertedUrl.trim(), network: content?.links.find((l) => l.originalUrl === originalUrl)?.network ?? "unknown" }));
      return apiPost(`/contents/${code}/links`, { links });
    },
    onSuccess: () => {
      toast.success("Đã lưu link affiliate thủ công.");
      setManualLinks({});
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể lưu link.");
    }
  });

  function fileBasename(p: string) {
    return p.split(/[\\/]/).pop() ?? p;
  }

  function handleRemoveMedia(index: number) {
    const next = [...effectiveMediaPaths];
    next.splice(index, 1);
    setMediaPaths(next);
  }

  if (detail.isLoading) return <p style={{ padding: 24 }}>Đang tải...</p>;
  if (!content) return <p style={{ padding: 24 }}>Không tìm thấy nội dung.</p>;

  function attemptPlatformLabel(attempt: ContentDetail["publishAttempts"][number]): string | null {
    if (attempt.target?.platform) return getPlatformLabel(attempt.target.platform);
    if (attempt.targetId) {
      const found = allTargetAccounts.find((a) => a.id === attempt.targetId);
      if (found) return getPlatformLabel(found.platform);
    }
    if (content?.platform) return getPlatformLabel(content.platform);
    return null;
  }

  return (
    <>
      <PageHeader
        title={content.code}
        eyebrow={<Link to="/contents">Quay lại danh sách</Link>}
        subtitle={platformLabel}
        actions={
          <>
            <Badge tone={content.status === "published" ? "good" : content.status === "failed" ? "danger" : "warn"}>{content.status}</Badge>
            <Button variant="secondary" icon={<Save aria-hidden />} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Lưu thay đổi
            </Button>
            <Button icon={<Send aria-hidden />} onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending || !effectiveTargetId}>
              Đăng ngay
            </Button>
          </>
        }
      />

      <div className="composer-single-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionCard title="Thiết lập bài đăng">
          <div className="composer-flow-grid">
            <div className="field compact-field full">
              <Label htmlFor="detail-target">Tài khoản đăng</Label>
              <Select id="detail-target" value={effectiveTargetId} onChange={(e) => setSelectedTargetId(e.target.value)}>
                <option value="">Chọn 1 tài khoản</option>
                {relevantTargets.map((account) => (
                  <option key={account.id} value={account.id}>{account.name} · {getPlatformLabel(account.platform)}</option>
                ))}
              </Select>
            </div>

            <div className="field compact-field">
              <Label htmlFor="detail-type">Loại bài đăng</Label>
              <Select id="detail-type" value={effectivePostType} onChange={(e) => setPostType(e.target.value)}>
                {postTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            <div className="field compact-field">
              <Label>Nền tảng</Label>
              <div className="selection-summary"><span>{platformLabel}</span></div>
            </div>

            <div className="field full">
              <Label htmlFor="draft-text">Nội dung bài viết</Label>
              <Textarea id="draft-text" value={effectiveDraftText} onChange={(e) => setDraftText(e.target.value)} rows={6} className="composer-textarea" />
            </div>

            {isThreadsContent ? (
              <div className="field full">
                <Label>Tuỳ chọn Threads</Label>
                <ThreadsPublishSettings value={effectiveThreads} onChange={setThreads} />
              </div>
            ) : null}

            <div className="field full">
              <Label htmlFor="first-comment">Comment đầu tiên</Label>
              <Textarea id="first-comment" value={effectiveComment} onChange={(e) => setComment(e.target.value)} rows={3} className="composer-textarea composer-textarea-sm" placeholder="Để trống nếu không cần comment." />
            </div>
          </div>
        </SectionCard>

        <SourcePackageSection
          content={content}
          metadata={metadata}
          expanded={showSourcePackage}
          onToggle={() => setShowSourcePackage((current) => !current)}
        />

        <SectionCard title="Media">
          {effectiveMediaPaths.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Chưa có media nào.</p>
          ) : (
            <div className="upload-list compact-two-col">
              {effectiveMediaPaths.map((path, index) => (
                <div key={`${path}-${index}`} className="upload-item">
                  <div style={{ minWidth: 0 }}>
                    <strong>Media {index + 1}</strong>
                    <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={path}>{fileBasename(path)}</small>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveMedia(index)}>
                    <Trash2 aria-hidden size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <FileUploadDropzone
              label={uploadMutation.isPending ? "Đang upload..." : "Thêm media (upload)"}
              accept="image/*,video/*"
              multiple
              onChange={(files) => files.forEach((file) => uploadMutation.mutate(file))}
            />
            <MediaPathInput onAdd={(file) => setMediaPaths((current) => [...(current ?? effectiveMediaPaths), file.localPath])} />
          </div>
        </SectionCard>

        {/* AI phân tích */}
        {metadata.ai?.analysis ? (
          <SectionCard title="Phân tích AI">
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span><strong>Debug score:</strong> {metadata.ai.analysis.confidence !== undefined ? `${Math.round(metadata.ai.analysis.confidence * 100)}%` : "—"}</span>
                <span><strong>Loại:</strong> {metadata.ai.analysis.messageType ?? "—"}</span>
                <span><strong>Sàn:</strong> {metadata.ai.analysis.platform ?? "—"}</span>
                {metadata.ai.model ? <span><strong>Model:</strong> {metadata.ai.model}</span> : null}
              </div>
              {metadata.ai.analysis.productName || metadata.ai.analysis.price || metadata.ai.analysis.discount ? (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {metadata.ai.analysis.productName ? <span><strong>Sản phẩm:</strong> {metadata.ai.analysis.productName}</span> : null}
                  {metadata.ai.analysis.price ? <span><strong>Giá:</strong> {metadata.ai.analysis.price}</span> : null}
                  {metadata.ai.analysis.discount ? <span><strong>Giảm:</strong> {metadata.ai.analysis.discount}</span> : null}
                  {metadata.ai.analysis.voucherCode ? <span><strong>Voucher:</strong> <code>{metadata.ai.analysis.voucherCode}</code></span> : null}
                </div>
              ) : null}
              {metadata.ai.analysis.reason ? (
                <div style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>{metadata.ai.analysis.reason}</div>
              ) : null}
              {metadata.ai.decision ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <strong>Quyết định:</strong>
                  <Badge tone={metadata.ai.decision.status === "ready_to_publish" ? "good" : metadata.ai.decision.status === "review" ? "warn" : "neutral"}>
                    {metadata.ai.decision.status ?? "—"}
                  </Badge>
                  {metadata.ai.decision.autoPublish ? <Badge tone="good">Auto publish</Badge> : null}
                  {metadata.ai.decision.reason ? <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{metadata.ai.decision.reason}</span> : null}
                </div>
              ) : null}
              {metadata.ai.usage ? (
                <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                  Token: {(metadata.ai.usage.promptTokens ?? 0) + (metadata.ai.usage.completionTokens ?? 0)} tổng ({metadata.ai.usage.promptTokens ?? 0} in / {metadata.ai.usage.completionTokens ?? 0} out)
                </div>
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        {/* Bảng link gốc ↔ affiliate + manual convert cho link lỗi */}
        {content.links.length > 0 ? (() => {
          const failedLinks = content.links.filter((l) => l.status === "failed" || l.status === "detected");
          const hasManualInput = Object.values(manualLinks).some((v) => v.trim());
          return (
            <SectionCard title="Affiliate links">
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                {content.links.map((link) => (
                  <div key={link.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "start", padding: "6px 0", borderBottom: "1px solid var(--color-border-subtle, #e5e7eb)" }}>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>Gốc · {link.network}</div>
                      <a href={link.originalUrl} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all", color: "var(--color-text)" }}>{link.originalUrl}</a>
                    </div>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>Affiliate</div>
                      {link.convertedUrl
                        ? <a href={link.convertedUrl} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all", color: "var(--color-primary)" }}>{link.convertedUrl}</a>
                        : (link.status === "failed" || link.status === "detected")
                          ? <Input
                              value={manualLinks[link.originalUrl] ?? ""}
                              onChange={(e) => setManualLinks((prev) => ({ ...prev, [link.originalUrl]: e.target.value }))}
                              placeholder="Dán link affiliate thủ công..."
                              style={{ fontSize: 12 }}
                            />
                          : <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                      {link.error ? <div style={{ color: "var(--color-danger)", fontSize: 11, marginTop: 2 }}>{link.error}</div> : null}
                    </div>
                    <Badge tone={link.status === "converted" ? "good" : link.status === "failed" ? "danger" : link.status === "skipped_by_ai" ? "neutral" : "warn"}>
                      {link.status}
                    </Badge>
                  </div>
                ))}
              </div>
              {failedLinks.length > 0 && hasManualInput ? (
                <div style={{ marginTop: 12 }}>
                  <Button onClick={() => manualLinkMutation.mutate()} disabled={manualLinkMutation.isPending}>
                    {manualLinkMutation.isPending ? "Đang lưu..." : "Lưu link thủ công"}
                  </Button>
                </div>
              ) : null}
            </SectionCard>
          );
        })() : null}

        <SectionCard title="Lịch sử đăng">
          {content.publishAttempts.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Chưa có lần đăng nào.</p>
          ) : (
            <div className="publish-attempts">
              {content.publishAttempts.map((attempt) => {
                const platformTag = attemptPlatformLabel(attempt);
                return (
                  <div key={attempt.id} className="publish-attempt-row">
                    <div className="publish-attempt-status">
                      {attempt.status === "success" ? <CheckCircle2 aria-hidden size={14} style={{ color: "var(--color-primary)" }} /> : attempt.status === "failed" ? <XCircle aria-hidden size={14} style={{ color: "var(--color-danger)" }} /> : <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>-</span>}
                      <span>{attempt.status}</span>
                      {platformTag ? <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 4 }}>({platformTag})</span> : null}
                    </div>
                    {attempt.resultUrl ? <a href={attempt.resultUrl} target="_blank" rel="noopener noreferrer" className="publish-attempt-link">Xem bài đăng</a> : null}
                    {attempt.error ? <div className="publish-attempt-error">{attempt.error}</div> : null}
                    <div className="publish-attempt-time">{new Date(attempt.createdAt).toLocaleString("vi-VN")}</div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
