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
  publishAttempts: Array<{ id: string; status: string; resultUrl?: string; error?: string; createdAt: string }>;
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

  const fbTargets = (accountsQuery.data?.accounts ?? []).filter(
    (a) => a.kind === "target" && a.platform === "facebook"
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
      setSaveResult({ success: true, message: "Da luu thay doi." });
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
      setTimeout(() => setSaveResult(null), 3000);
    },
    onError: (error) => {
      setSaveResult({ success: false, message: error instanceof Error ? error.message : "Khong the luu." });
    }
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      apiPost<{ queued: boolean; targetCount: number }>(`/contents/${code}/publish`, {
        targetIds: effectiveTargetIds
      }),
    onSuccess: (data) => {
      setPublishResult({ success: true, message: `Da dua vao hang cho dang cho ${data.targetCount} tai khoan.` });
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["content", code] });
      }, 2000);
    },
    onError: (error) => {
      setPublishResult({ success: false, message: error instanceof Error ? error.message : "Khong the dang bai." });
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

  if (detail.isLoading) {
    return <p style={{ padding: 24 }}>Dang tai...</p>;
  }

  if (!content) {
    return <p style={{ padding: 24 }}>Khong tim thay noi dung.</p>;
  }

  return (
    <>
      <PageHeader
        title={content.code}
        eyebrow={<Link to="/contents">Quay lai danh sach</Link>}
        subtitle={content.platform}
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
              Luu thay doi
            </Button>
            <Button
              icon={<Send aria-hidden />}
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
            >
              Dang ngay
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
        <SectionCard title="Noi dung">
          <div className="field">
            <Label htmlFor="draft-text">Noi dung bai viet</Label>
            <Textarea
              id="draft-text"
              value={effectiveDraftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={8}
            />
          </div>
        </SectionCard>

        <SectionCard title="Loai bai">
          <div className="field">
            <Label htmlFor="post-type">Loai bai dang</Label>
            <Select
              id="post-type"
              value={effectivePostType}
              onChange={(e) => setPostType(e.target.value)}
            >
              <option value="feed">Feed</option>
              <option value="story">Story</option>
              <option value="reel">Reel</option>
            </Select>
          </div>
        </SectionCard>

        <SectionCard title="Media">
          {effectiveMediaPaths.length === 0 ? (
            <p style={{ color: "#68746d", fontSize: 14 }}>Chua co media nao.</p>
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
                    aria-label="Xoa media"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p style={{ marginTop: 10, fontSize: 12, color: "#68746d" }}>
            De them media moi, tao lai bai.
          </p>
        </SectionCard>

        <SectionCard title="Comment dau tien">
          <div className="field">
            <Label htmlFor="first-comment">Noi dung comment</Label>
            <Textarea
              id="first-comment"
              value={effectiveComment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Tuy chon — de trong neu khong can comment."
            />
          </div>
        </SectionCard>

        <SectionCard title="Tai khoan dang">
          {fbTargets.length === 0 ? (
            <p style={{ color: "#68746d", fontSize: 14 }}>Chua co tai khoan Facebook target nao.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fbTargets.map((account) => (
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
                </label>
              ))}
            </div>
          )}
        </SectionCard>

        {content.publishAttempts.length > 0 ? (
          <SectionCard title="Lich su dang">
            <div className="publish-attempts">
              {content.publishAttempts.map((attempt) => (
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
                  </div>
                  {attempt.resultUrl ? (
                    <a href={attempt.resultUrl} target="_blank" rel="noopener noreferrer" className="publish-attempt-link">
                      Xem bai dang
                    </a>
                  ) : null}
                  {attempt.error ? <div className="publish-attempt-error">{attempt.error}</div> : null}
                  <div className="publish-attempt-time">{new Date(attempt.createdAt).toLocaleString("vi-VN")}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}
