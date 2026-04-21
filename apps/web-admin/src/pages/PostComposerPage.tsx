import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Send, Upload, X } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Badge } from "../components/ui/Badge";
import { getPlatformLabel, isSupportedTargetPlatform } from "../utils/platforms";

type TargetAccount = {
  id: string;
  name: string;
  platform: string;
  isActive: boolean;
  health: string;
};

type AccountResponse = {
  accounts: Array<{
    id: string;
    kind: "source" | "target";
    name: string;
    platform: string;
    isActive: boolean;
    health: string;
  }>;
};

type UploadedFile = {
  filename: string;
  localPath: string;
  mimeType: string;
  fileSize?: number;
};

type CreatePostResponse = {
  post: {
    id: string;
    status: string;
  };
};

type ContentResponse = {
  content: {
    code: string;
  };
};

type PublishConfig = {
  targetId: string;
  mode: "now" | "schedule";
  scheduledAt: string;
};

function isImageType(file: UploadedFile) {
  return file.mimeType.startsWith("image/");
}

function isVideoType(file: UploadedFile) {
  return file.mimeType.startsWith("video/");
}

const PLATFORM_BADGE_TONE: Record<string, "good" | "warn" | "neutral" | "danger"> = {
  facebook: "good",
  instagram: "warn",
  threads: "neutral"
};

function validateMedia(platform: string, type: string, mediaFiles: UploadedFile[]): string | null {
  if (platform === "facebook") {
    if (type === "story" && (mediaFiles.length !== 1 || !mediaFiles.every(isImageType))) return "Facebook Story cần đúng 1 ảnh.";
    if (type === "reel" && (mediaFiles.length !== 1 || !mediaFiles.every(isVideoType))) return "Facebook Reel cần đúng 1 video.";
    return null;
  }
  if (platform === "instagram") {
    if (type === "feed") return null;
    if (type === "story" && (mediaFiles.length !== 1 || !mediaFiles.every(isImageType))) return "Instagram Story cần đúng 1 ảnh.";
    if (type === "reel" && (mediaFiles.length !== 1 || !mediaFiles.every(isVideoType))) return "Instagram Reel cần đúng 1 video.";
    return null;
  }
  if (platform === "threads") return null;
  if (type === "story" && (mediaFiles.length !== 1 || !mediaFiles.every(isImageType))) return "Story cần đúng 1 ảnh.";
  if (type === "reel" && (mediaFiles.length !== 1 || !mediaFiles.every(isVideoType))) return "Reel cần đúng 1 video.";
  return null;
}

function allowedPostTypes(platform: string): Array<{ value: string; label: string }> {
  if (platform === "threads") return [{ value: "feed", label: "Feed" }];
  return [
    { value: "feed", label: "Feed" },
    { value: "story", label: "Story" },
    { value: "reel", label: "Reel" }
  ];
}

function mediaHint(platform: string, type: string): string {
  if (platform === "threads") return "Threads: có thể đăng không cần media.";
  if (platform === "facebook" && type === "story") return "Facebook Story: đúng 1 ảnh.";
  if (platform === "instagram" && type === "story") return "Instagram Story: đúng 1 ảnh.";
  if (type === "reel") return "Reel: đúng 1 video.";
  return "Feed: có thể nhiều media.";
}

export function PostComposerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({ type: "feed", content: "", comment: "" });
  const [publishConfig, setPublishConfig] = useState<PublishConfig>({ targetId: "", mode: "now", scheduledAt: "" });
  const [mediaFiles, setMediaFiles] = useState<UploadedFile[]>([]);
  const [commentMediaFiles, setCommentMediaFiles] = useState<UploadedFile[]>([]);
  const [includeFirstComment, setIncludeFirstComment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ postId: string; contentCode: string; mode: "now" | "schedule" } | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<AccountResponse>("/accounts")
  });

  const targetAccounts = useMemo<TargetAccount[]>(() => {
    return (accountsQuery.data?.accounts ?? [])
      .filter((account) => account.kind === "target" && isSupportedTargetPlatform(account.platform))
      .map((account) => ({
        id: account.id,
        name: account.name,
        platform: account.platform,
        isActive: account.isActive,
        health: account.health
      }));
  }, [accountsQuery.data]);

  const selectedAccount = useMemo(() => targetAccounts.find((account) => account.id === publishConfig.targetId) ?? null, [publishConfig.targetId, targetAccounts]);
  const selectedPlatform = selectedAccount?.platform ?? "facebook";
  const postTypeOptions = useMemo(() => allowedPostTypes(selectedPlatform), [selectedPlatform]);

  useEffect(() => {
    if (!selectedAccount) return;
    if (selectedAccount.platform === "threads" && form.type !== "feed") {
      setForm((current) => ({ ...current, type: "feed" }));
      setMediaFiles([]);
    }
  }, [selectedAccount, form.type]);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: "post" | "comment" }) => {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/uploads/manual`, {
        method: "POST",
        body,
        credentials: "include"
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Upload thất bại");
      return { file: payload.data.file as UploadedFile, kind };
    },
    onSuccess: ({ file, kind }) => {
      if (kind === "post") setMediaFiles((current) => [...current, file]);
      else setCommentMediaFiles((current) => [...current, file]);
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!form.content.trim()) throw new Error("Cần nhập nội dung bài đăng.");
      if (!publishConfig.targetId) throw new Error("Cần chọn 1 tài khoản đăng.");
      if (!selectedAccount) throw new Error("Không tìm thấy tài khoản đã chọn.");
      if (publishConfig.mode === "schedule" && !publishConfig.scheduledAt) throw new Error("Đã chọn hẹn lịch nhưng chưa nhập thời gian.");
      if (selectedAccount.platform === "threads" && form.type !== "feed") throw new Error(`Tài khoản Threads \"${selectedAccount.name}\" chỉ hỗ trợ feed.`);

      const mediaError = validateMedia(selectedAccount.platform, form.type, mediaFiles);
      if (mediaError) throw new Error(`[${getPlatformLabel(selectedAccount.platform)}] ${mediaError}`);

      const hasScheduledTarget = publishConfig.mode === "schedule";
      const isFacebookTarget = selectedAccount.platform === "facebook";
      let fbPostId: string | undefined;
      let scheduledAt: string | undefined;

      if (isFacebookTarget) {
        const created = await apiPost<CreatePostResponse>("/facebook/posts", {
          type: form.type,
          caption: form.content.trim(),
          media: mediaFiles.map((file) => ({ localPath: file.localPath, mimeType: file.mimeType })),
          comments: includeFirstComment && form.comment.trim()
            ? [{ text: form.comment.trim(), delayMinutes: 5, media: commentMediaFiles.map((file) => file.localPath) }]
            : [],
          targets: [{
            targetAccountId: selectedAccount.id,
            scheduleMode: "fixed",
            fixedTime: publishConfig.mode === "schedule" ? publishConfig.scheduledAt : undefined
          }]
        });
        fbPostId = created.post.id;

        const queued = await apiPost<{ scheduledAt: string }>(`/facebook/posts/${created.post.id}/queue`, {
          mode: hasScheduledTarget ? "schedule" : "now",
          targets: [{
            targetId: selectedAccount.id,
            mode: publishConfig.mode,
            scheduledAt: publishConfig.mode === "schedule" ? publishConfig.scheduledAt : undefined
          }]
        });
        scheduledAt = queued.scheduledAt;
      }

      const contentCreated = await apiPost<ContentResponse>("/contents/manual", {
        originalText: form.content.trim(),
        platform: selectedAccount.platform,
        type: form.type,
        comment: includeFirstComment ? form.comment.trim() || undefined : undefined,
        mediaPaths: mediaFiles.map((file) => file.localPath),
        commentMedia: includeFirstComment ? commentMediaFiles.map((file) => file.localPath) : [],
        ...(fbPostId ? { fbPostId } : {}),
        targetIds: [selectedAccount.id],
        scheduledAt,
        status: hasScheduledTarget ? "scheduled" : "publishing",
        mode: hasScheduledTarget ? "schedule" : "now"
      });

      if (!isFacebookTarget && !hasScheduledTarget) {
        await apiPost<{ queued: boolean }>(`/contents/${contentCreated.content.code}/publish`, {
          targetIds: [selectedAccount.id]
        });
      }

      return {
        postId: fbPostId ?? contentCreated.content.code,
        contentCode: contentCreated.content.code,
        mode: hasScheduledTarget ? "schedule" : "now"
      } as const;
    },
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: ["contents"] });
      navigate(`/contents/${data.contentCode}`);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Không thể tạo bài đăng.");
    }
  });

  return (
    <>
      <PageHeader
        title="Nhập bài đăng"
        subtitle="Flow gọn: chọn 1 tài khoản, chọn loại bài, nhập nội dung, rồi chọn chế độ đăng."
        actions={
          <div className="actions">
            <Link to="/contents">
              <Button variant="secondary">Mở danh sách bài viết</Button>
            </Link>
            <Button variant="secondary" icon={<Upload aria-hidden />} onClick={() => void queryClient.invalidateQueries({ queryKey: ["accounts"] })}>
              Làm mới tài khoản
            </Button>
          </div>
        }
      />

      {result ? (
        <SectionCard className="mb-4" style={{ marginBottom: 16 }}>
          <div className="field-success" role="status">
            <CheckCircle2 aria-hidden size={14} />
            <span>
              Đã tạo bài đăng <strong>{result.postId}</strong>. Đang chuyển sang danh sách quản lý bài.
            </span>
          </div>
        </SectionCard>
      ) : null}

      {error ? (
        <SectionCard className="mb-4" style={{ marginBottom: 16 }}>
          <div className="field-error" role="alert">{error}</div>
        </SectionCard>
      ) : null}

      <SectionCard title="Tạo bài đăng" className="composer-single-card">
        {targetAccounts.length === 0 ? (
          <EmptyState title="Chưa có tài khoản đăng bài nào" description="Hãy vào mục Tài khoản đăng bài để tạo account trước." />
        ) : (
          <div className="composer-flow-grid">
            <div className="field compact-field full">
              <Label htmlFor="target-account">Tài khoản đăng</Label>
              <Select
                id="target-account"
                value={publishConfig.targetId}
                onChange={(event) => {
                  const nextTargetId = event.target.value;
                  const nextAccount = targetAccounts.find((account) => account.id === nextTargetId) ?? null;
                  setError(null);
                  setPublishConfig((current) => ({ ...current, targetId: nextTargetId }));
                  setMediaFiles([]);
                  if (nextAccount?.platform === "threads") {
                    setForm((current) => ({ ...current, type: "feed" }));
                  }
                }}
              >
                <option value="">Chọn 1 tài khoản</option>
                {targetAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {getPlatformLabel(account.platform)} · {account.isActive ? "bật" : "tắt"}
                  </option>
                ))}
              </Select>
              {selectedAccount ? (
                <div className="composer-meta-row">
                  <Badge tone={PLATFORM_BADGE_TONE[selectedAccount.platform] ?? "neutral"}>{getPlatformLabel(selectedAccount.platform)}</Badge>
                  <span className="actions-note">Health: {selectedAccount.health}</span>
                </div>
              ) : null}
            </div>

            <div className="field compact-field">
              <Label htmlFor="post-type">Loại bài đăng</Label>
              <Select
                id="post-type"
                value={form.type}
                onChange={(event) => {
                  setError(null);
                  setMediaFiles([]);
                  setForm((current) => ({ ...current, type: event.target.value }));
                }}
                disabled={!selectedAccount}
              >
                {postTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            <div className="field compact-field">
              <Label>Rule media</Label>
              <div className="selection-summary">
                <span>{mediaHint(selectedPlatform, form.type)}</span>
              </div>
            </div>

            <div className="field full">
              <Label htmlFor="post-content">Nội dung</Label>
              <Textarea id="post-content" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="Nhập nội dung bài đăng..." rows={6} className="composer-textarea" />
            </div>

            <div className="field full">
              <div className="inline-head">
                <Label>File đính kèm</Label>
                <Button type="button" variant="secondary" size="sm" icon={<Upload aria-hidden />} onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                  Tải file lên
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple={form.type === "feed"}
                accept={form.type === "reel" ? "video/*" : "image/*,video/*"}
                style={{ display: "none" }}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  for (const file of files) uploadMutation.mutate({ file, kind: "post" });
                  event.currentTarget.value = "";
                }}
              />
              <div className="upload-list compact-two-col">
                {mediaFiles.length === 0 ? <div className="upload-empty">Chưa có file media.</div> : null}
                {mediaFiles.map((file, index) => (
                  <div key={`${file.localPath}-${index}`} className="upload-item">
                    <div>
                      <strong>{file.filename}</strong>
                      <small>{file.mimeType}</small>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setMediaFiles((current) => current.filter((item) => item.localPath !== file.localPath))}>
                      <X aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="field full composer-checkbox-row">
              <label className="target-toggle">
                <input
                  type="checkbox"
                  checked={includeFirstComment}
                  onChange={(event) => {
                    setIncludeFirstComment(event.target.checked);
                    if (!event.target.checked) {
                      setForm((current) => ({ ...current, comment: "" }));
                      setCommentMediaFiles([]);
                    }
                  }}
                />
                <span>Thêm comment đầu tiên</span>
              </label>
            </div>

            {includeFirstComment ? (
              <>
                <div className="field full">
                  <Label htmlFor="post-comment">Comment đầu tiên</Label>
                  <Textarea id="post-comment" value={form.comment} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} rows={3} className="composer-textarea composer-textarea-sm" />
                </div>

                <div className="field full">
                  <div className="inline-head">
                    <Label>File đính kèm comment</Label>
                    <Button type="button" variant="secondary" size="sm" icon={<Upload aria-hidden />} onClick={() => commentFileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                      Tải file lên
                    </Button>
                  </div>
                  <input
                    ref={commentFileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    style={{ display: "none" }}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      for (const file of files) uploadMutation.mutate({ file, kind: "comment" });
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="upload-list compact-two-col compact">
                    {commentMediaFiles.length === 0 ? <div className="upload-empty">Chưa có media comment.</div> : null}
                    {commentMediaFiles.map((file, index) => (
                      <div key={`${file.localPath}-${index}`} className="upload-item">
                        <div>
                          <strong>{file.filename}</strong>
                          <small>{file.mimeType}</small>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setCommentMediaFiles((current) => current.filter((item) => item.localPath !== file.localPath))}>
                          <X aria-hidden />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            <div className="field compact-field">
              <Label htmlFor="publish-mode">Chế độ đăng bài</Label>
              <Select id="publish-mode" value={publishConfig.mode} onChange={(event) => setPublishConfig((current) => ({ ...current, mode: event.target.value as "now" | "schedule" }))}>
                <option value="now">Đăng ngay</option>
                <option value="schedule">Hẹn lịch</option>
              </Select>
            </div>

            <div className="field compact-field">
              <Label htmlFor="publish-time">Thời gian</Label>
              <Input
                id="publish-time"
                type="datetime-local"
                value={publishConfig.scheduledAt}
                disabled={publishConfig.mode !== "schedule"}
                onChange={(event) => setPublishConfig((current) => ({ ...current, scheduledAt: event.target.value }))}
              />
            </div>

            <div className="actions composer-actions full" style={{ marginTop: 8 }}>
              <Button icon={<Send aria-hidden />} onClick={() => { setError(null); submitMutation.mutate(); }} disabled={!publishConfig.targetId || submitMutation.isPending || uploadMutation.isPending}>
                {submitMutation.isPending ? "Đang xử lý..." : "Áp dụng"}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}
