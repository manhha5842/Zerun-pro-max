import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Save, Send, Trash2, XCircle } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api/client";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import { SectionCard } from "../components/common/SectionCard";
import { PageHeader } from "../components/common/PageHeader";
import { ThreadsPublishSettings, buildThreadsPublishPayload, normalizeThreadsPublishSettings, type ThreadsPublishSettingsValue } from "../components/common/ThreadsPublishSettings";
import { getPlatformLabel, isSupportedTargetPlatform } from "../utils/platforms";

type ContentDetail = {
  id: string;
  code: string;
  platform: string;
  status: string;
  originalText: string;
  draftText?: string;
  finalText?: string;
  scheduledTargets?: string[];
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
};

type DetailData = { content: ContentDetail };

type AccountsData = {
  accounts: Array<{ id: string; name: string; platform: string; kind: string }>;
};

function getMetadata(content: ContentDetail): { type?: string; comment?: string; mediaPaths?: string[]; threads?: Partial<ThreadsPublishSettingsValue> } {
  const raw = (content as unknown as { metadata?: unknown }).metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as { type?: string; comment?: string; mediaPaths?: string[]; threads?: Partial<ThreadsPublishSettingsValue> };
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

export function ContentDetailPage() {
  const { code } = useParams();
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
      toast.success("Đã lưu thay đổi.");
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
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

        <SectionCard title="Media hiện có">
          {effectiveMediaPaths.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Chưa có media nào.</p>
          ) : (
            <div className="upload-list compact-two-col">
              {effectiveMediaPaths.map((path, index) => (
                <div key={`${path}-${index}`} className="upload-item">
                  <div>
                    <strong>Media {index + 1}</strong>
                    <small>{path}</small>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveMedia(index)}>
                    <Trash2 aria-hidden size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="field-help" style={{ marginTop: 10 }}>Để thêm media mới, tạo lại bài ở màn hình nhập bài đăng.</p>
        </SectionCard>

        {content.publishAttempts.length > 0 ? (
          <SectionCard title="Lịch sử đăng">
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
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}
