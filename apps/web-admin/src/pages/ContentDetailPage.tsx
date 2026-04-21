import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Send, Save, Trash2, XCircle } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api/client";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { SectionCard } from "../components/common/SectionCard";
import { PageHeader } from "../components/common/PageHeader";
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

function getMetadata(content: ContentDetail): { type?: string; comment?: string; mediaPaths?: string[] } {
  const raw = (content as unknown as { metadata?: unknown }).metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as { type?: string; comment?: string; mediaPaths?: string[] };
  }
  return {};
}

/** Returns available post types for the content platform. */
function postTypesForPlatform(platform: string): Array<{ value: string; label: string }> {
  if (platform === "threads") {
    return [{ value: "feed", label: "Feed" }];
  }
  return [
    { value: "feed", label: "Feed" },
    { value: "story", label: "Story" },
    { value: "reel", label: "Reel" }
  ];
}

export function ContentDetailPage() {
  const { code } = useParams();
  const queryClient = useQueryClient();

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

  /** Target accounts that match the contentu2019s platform (or all supported platforms when platform is generic). */
  const allTargetAccounts = (accountsQuery.data?.accounts ?? []).filter((a) => a.kind === "target");
  const relevantTargets = allTargetAccounts.filter((a) =>
    content?.platform && isSupportedTargetPlatform(content.platform)
      ? a.platform === content.platform
      : isSupportedTargetPlatform(a.platform)
  );

  const [draftText, setDraftText] = useState<string | undefined>(undefined);
  const [postType, setPostType] = useState<string | undefined>(undefined);
  const [comment, setComment] = useState<string | undefined>(undefined);
  const [mediaPaths, setMediaPaths] = useState<string[] | undefined>(undefined);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[] | undefined>(undefined);

  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null);

  const effectiveDraftText = draftText ?? content?.draftText ?? content?.originalText ?? "";
  const effectivePostType = postType ?? metadata.type ?? "feed";
  const effectiveComment = comment ?? metadata.comment ?? "";
  const effectiveMediaPaths = mediaPaths ?? metadata.mediaPaths ?? [];
  const effectiveTargetIds = selectedTargetIds ?? content?.scheduledTargets ?? [];

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut(`/contents/${code}/edit`, {
        draftText: effectiveDraftText,
        type: effectivePostType,
        comment: effectiveComment,
        mediaPaths: effectiveMediaPaths,
        targetIds: effectiveTargetIds
      }),
    onSuccess: () => {
      setSaveResult({ success: true, message: "u0110u00e3 lu01b0u thay u0111u1ed5i." });
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
      setTimeout(() => setSaveResult(null), 3000);
    },
    onError: (error) => {
      setSaveResult({ success: false, message: error instanceof Error ? error.message : "Khu00f4ng thu1ec3 lu01b0u." });
    }
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      apiPost<{ queued: boolean; targetCount: number }>(`/contents/${code}/publish`, {
        targetIds: effectiveTargetIds
      }),
    onSuccess: (data) => {
      setPublishResult({ success: true, message: `u0110u00e3 u0111u01b0a vu00e0o hu00e0ng chu1edd u0111u0103ng cho ${data.targetCount} tu00e0i khou1ea3n.` });
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["content", code] });
      }, 2000);
    },
    onError: (error) => {
      setPublishResult({ success: false, message: error instanceof Error ? error.message : "Khu00f4ng thu1ec3 u0111u0103ng bu00e0i." });
    }
  });

  function handleRemoveMedia(index: number) {
    const next = [...effectiveMediaPaths];
    next.splice(index, 1);
    setMediaPaths(next);
  }

  function handleToggleTarget(targetId: string) {
    const current = effectiveTargetIds;
    if (current.includes(targetId)) {
      setSelectedTargetIds(current.filter((id) => id !== targetId));
    } else {
      setSelectedTargetIds([...current, targetId]);
    }
  }

  /** Resolve platform label for a publish attempt.
   * The API does not yet join target in publishAttempts; we fall back to a local lookup. */
  function attemptPlatformLabel(attempt: ContentDetail["publishAttempts"][number]): string | null {
    if (attempt.target?.platform) return getPlatformLabel(attempt.target.platform);
    if (attempt.targetId) {
      const found = allTargetAccounts.find((a) => a.id === attempt.targetId);
      if (found) return getPlatformLabel(found.platform);
    }
    if (content?.platform) return getPlatformLabel(content.platform);
    return null;
  }

  if (detail.isLoading) {
    return <p style={{ padding: 24 }}>u0110ang tu1ea3i...</p>;
  }

  if (!content) {
    return <p style={{ padding: 24 }}>Khu00f4ng tu00ecm thu1ea5y nu1ed9i dung.</p>;
  }

  const platformLabel = getPlatformLabel(content.platform);
  const postTypeOptions = postTypesForPlatform(content.platform);

  return (
    <>
      <PageHeader
        title={content.code}
        eyebrow={<Link to="/contents">Quay lu1ea1i danh su00e1ch</Link>}
        subtitle={platformLabel}
        actions={
          <>
            <Badge tone={content.status === "published" ? "good" : content.status === "failed" ? "danger" : "warn"}>
              {content.status}
            </Badge>
            <Button
              variant="secondary"
              icon={<Save aria-hidden />}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              Lu01b0u thay u0111u1ed5i
            </Button>
            <Button
              icon={<Send aria-hidden />}
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || effectiveTargetIds.length === 0}
              title={effectiveTargetIds.length === 0 ? "Chu1ecdn u00edt nhu1ea5t mu1ed9t tu00e0i khou1ea3n tru01b0u1edbc" : "u0110u0103ng ngay"}
            >
              u0110u0103ng ngay
            </Button>
          </>
        }
      />

      {saveResult ? (
        <SectionCard style={{ marginBottom: 16 }}>
          <div className={saveResult.success ? "field-success" : "field-error"} role={saveResult.success ? "status" : "alert"}>
            {saveResult.success ? <CheckCircle2 aria-hidden size={14} /> : <XCircle aria-hidden size={14} />}
            <span>{saveResult.message}</span>
          </div>
        </SectionCard>
      ) : null}

      {publishResult ? (
        <SectionCard style={{ marginBottom: 16 }}>
          <div className={publishResult.success ? "field-success" : "field-error"} role={publishResult.success ? "status" : "alert"}>
            {publishResult.success ? <CheckCircle2 aria-hidden size={14} /> : <XCircle aria-hidden size={14} />}
            <span>{publishResult.message}</span>
          </div>
        </SectionCard>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionCard title="Nu1ed9i dung">
          <div className="field">
            <Label htmlFor="draft-text">Nu1ed9i dung bu00e0i viu1ebft</Label>
            <Textarea
              id="draft-text"
              value={effectiveDraftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={8}
            />
          </div>
        </SectionCard>

        <SectionCard title="Lou1ea1i bu00e0i">
          <div className="field">
            <Label htmlFor="post-type">Lou1ea1i bu00e0i u0111u0103ng ({platformLabel})</Label>
            <Select
              id="post-type"
              value={effectivePostType}
              onChange={(e) => setPostType(e.target.value)}
            >
              {postTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
        </SectionCard>

        <SectionCard title="Media">
          {effectiveMediaPaths.length === 0 ? (
            <p style={{ color: "#68746d", fontSize: 14 }}>Chu01b0a cu00f3 media nu00e0o.</p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
              {effectiveMediaPaths.map((path, index) => (
                <li
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "var(--color-surface, #f5f7f5)",
                    fontSize: 13,
                    wordBreak: "break-all"
                  }}
                >
                  <span>{path}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia(index)}
                    style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#b42318", padding: 2 }}
                    aria-label="Xu00f3a media"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p style={{ marginTop: 10, fontSize: 12, color: "#68746d" }}>
            u0110u1ec3 thu00eam media mu1edbi, tu1ea1o lu1ea1i bu00e0i.
          </p>
        </SectionCard>

        <SectionCard title="Comment u0111u1ea7u tiu00ean">
          <div className="field">
            <Label htmlFor="first-comment">Nu1ed9i dung comment</Label>
            <Textarea
              id="first-comment"
              value={effectiveComment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Tu00f9y chu1ecdn u2014 u0111u1ec3 tru1ed1ng nu1ebfu khu00f4ng cu1ea7n comment."
            />
          </div>
        </SectionCard>

        <SectionCard title={`Tu00e0i khou1ea3n u0111u0103ng (${platformLabel})`}>
          {relevantTargets.length === 0 ? (
            <p style={{ color: "#68746d", fontSize: 14 }}>Chu01b0a cu00f3 tu00e0i khou1ea3n {platformLabel} target nu00e0o.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {relevantTargets.map((account) => (
                <label
                  key={account.id}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}
                >
                  <input
                    type="checkbox"
                    checked={effectiveTargetIds.includes(account.id)}
                    onChange={() => handleToggleTarget(account.id)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>{account.name}</span>
                  <span style={{ fontSize: 11, color: "#68746d", marginLeft: 4 }}>({getPlatformLabel(account.platform)})</span>
                </label>
              ))}
            </div>
          )}
        </SectionCard>

        {content.publishAttempts.length > 0 ? (
          <SectionCard title="Lu1ecbch su1eed u0111u0103ng">
            <div className="publish-attempts">
              {content.publishAttempts.map((attempt) => {
                const platformTag = attemptPlatformLabel(attempt);
                return (
                  <div key={attempt.id} className="publish-attempt-row">
                    <div className="publish-attempt-status">
                      {attempt.status === "success" ? (
                        <CheckCircle2 aria-hidden size={14} style={{ color: "#0f6f5c" }} />
                      ) : attempt.status === "failed" ? (
                        <XCircle aria-hidden size={14} style={{ color: "#b42318" }} />
                      ) : (
                        <span style={{ fontSize: 12, color: "#68746d" }}>-</span>
                      )}
                      <span>{attempt.status}</span>
                      {platformTag ? (
                        <span style={{ fontSize: 11, color: "#68746d", marginLeft: 4 }}>({platformTag})</span>
                      ) : null}
                    </div>
                    {attempt.resultUrl ? (
                      <a href={attempt.resultUrl} target="_blank" rel="noopener noreferrer" className="publish-attempt-link">
                        Xem bu00e0i u0111u0103ng
                      </a>
                    ) : null}
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
