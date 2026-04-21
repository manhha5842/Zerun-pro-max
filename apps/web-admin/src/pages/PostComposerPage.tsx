import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, CheckCircle2, FilePlus2, Send, Upload, X } from "lucide-react";
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

type TargetSchedule = {
  enabled: boolean;
  mode: "now" | "schedule";
  scheduledAt: string;
};

function isImageType(file: UploadedFile) {
  return file.mimeType.startsWith("image/");
}

function isVideoType(file: UploadedFile) {
  return file.mimeType.startsWith("video/");
}

/**
 * Platform badge colours — lightweight visual hint.
 */
const PLATFORM_BADGE_TONE: Record<string, "good" | "warn" | "neutral" | "danger"> = {
  facebook: "good",
  instagram: "warn",
  threads: "neutral"
};

/**
 * Validate media selection for a given (platform, type) combination.
 * Returns an error string or null if valid.
 */
function validateMedia(platform: string, type: string, mediaFiles: UploadedFile[]): string | null {
  if (platform === "facebook") {
    if (type === "story" && (mediaFiles.length !== 1 || !mediaFiles.every(isImageType))) {
      return "Facebook Story cần đúng 1 ảnh.";
    }
    if (type === "reel" && (mediaFiles.length !== 1 || !mediaFiles.every(isVideoType))) {
      return "Facebook Reel cần đúng 1 video.";
    }
    return null;
  }
  if (platform === "instagram") {
    if (type === "feed") {
      return null;
    }
    if (type === "story") {
      if (mediaFiles.length !== 1 || !mediaFiles.every(isImageType)) return "Instagram Story cần đúng 1 ảnh.";
      return null;
    }
    if (type === "reel") {
      if (mediaFiles.length !== 1 || !mediaFiles.every(isVideoType)) return "Instagram Reel cần đúng 1 video.";
      return null;
    }
  }
  if (platform === "threads") {
    // threads: text-only or with media; no story/reel
    return null;
  }
  // generic fallback
  if (type === "story" && (mediaFiles.length !== 1 || !mediaFiles.every(isImageType))) {
    return "Story cần đúng 1 ảnh.";
  }
  if (type === "reel" && (mediaFiles.length !== 1 || !mediaFiles.every(isVideoType))) {
    return "Reel cần đúng 1 video.";
  }
  return null;
}

/**
 * Post types available per-platform.
 */
function allowedPostTypes(platform: string): Array<{ value: string; label: string }> {
  if (platform === "threads") {
    return [{ value: "feed", label: "Feed" }];
  }
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
  const [form, setForm] = useState({
    type: "feed",
    content: "",
    comment: ""
  });
  const [mediaFiles, setMediaFiles] = useState<UploadedFile[]>([]);
  const [commentMediaFiles, setCommentMediaFiles] = useState<UploadedFile[]>([]);
  const [targetSchedules, setTargetSchedules] = useState<Record<string, TargetSchedule>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ postId: string; contentCode: string; mode: "now" | "schedule" } | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<AccountResponse>("/accounts")
  });

  /** All target accounts that belong to a supported publish platform. */
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

  /** Derive the platform for the current post based on enabled targets.
   * If targets span multiple platforms the form will still use form.type,
   * but validation is done per-account platform. */
  const enabledAccountPlatforms = useMemo(() => {
    const enabled = Object.entries(targetSchedules)
      .filter(([, c]) => c.enabled)
      .map(([id]) => targetAccounts.find((a) => a.id === id)?.platform ?? "");
    return [...new Set(enabled.filter(Boolean))];
  }, [targetSchedules, targetAccounts]);

  /** Post type options depend on enabled platforms; show superset but validate per-platform. */
  const postTypeOptions = useMemo(() => {
    // If all enabled accounts are Threads, hide story/reel
    if (enabledAccountPlatforms.length > 0 && enabledAccountPlatforms.every((p) => p === "threads")) {
      return allowedPostTypes("threads");
    }
    return allowedPostTypes("facebook"); // full set
  }, [enabledAccountPlatforms]);

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
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "Upload thất bại");
      }
      return { file: payload.data.file as UploadedFile, kind };
    },
    onSuccess: ({ file, kind }) => {
      if (kind === "post") {
        setMediaFiles((current) => [...current, file]);
      } else {
        setCommentMediaFiles((current) => [...current, file]);
      }
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const selectedTargets = Object.entries(targetSchedules).filter(([, config]) => config.enabled);
      if (!form.content.trim()) throw new Error("Cần nhập nội dung bài đăng.");
      if (!selectedTargets.length) throw new Error("Cần chọn ít nhất một tài khoản.");

      // Validate media constraints per-platform
      for (const [targetId] of selectedTargets) {
        const account = targetAccounts.find((a) => a.id === targetId);
        if (!account) continue;
        // Threads: no story/reel mode
        if (account.platform === "threads" && form.type !== "feed") {
          throw new Error(`Tài khoản Threads "${account.name}" không hỗ trợ loại bài "${form.type}". Chỉ hỗ trợ feed.`);
        }
        const mediaError = validateMedia(account.platform, form.type, mediaFiles);
        if (mediaError) throw new Error(`[${getPlatformLabel(account.platform)}] ${mediaError}`);
      }

      const hasScheduledTarget = selectedTargets.some(([, config]) => config.mode === "schedule");
      const invalidScheduledTarget = selectedTargets.find(([, config]) => config.mode === "schedule" && !config.scheduledAt);
      if (invalidScheduledTarget) {
        throw new Error("Có tài khoản đang chọn hẹn lịch nhưng chưa nhập thời gian.");
      }

      // Determine primary platform from enabled accounts (use first if mixed)
      const primaryAccount = targetAccounts.find((a) => a.id === selectedTargets[0]?.[0]);
      const primaryPlatform = primaryAccount?.platform ?? "facebook";

      // For Facebook targets, we create a FB post via the legacy /facebook/posts route.
      // For Instagram / Threads, we go straight to /contents/manual and let the worker handle publish.
      const facebookTargets = selectedTargets.filter(([id]) => targetAccounts.find((a) => a.id === id)?.platform === "facebook");
      const nonFacebookTargets = selectedTargets.filter(([id]) => targetAccounts.find((a) => a.id === id)?.platform !== "facebook");

      let fbPostId: string | undefined;
      let scheduledAt: string | undefined;

      if (facebookTargets.length > 0) {
        const postPayload = {
          type: form.type,
          caption: form.content.trim(),
          media: mediaFiles.map((file) => ({
            localPath: file.localPath,
            mimeType: file.mimeType
          })),
          comments: form.comment.trim()
            ? [{ text: form.comment.trim(), delayMinutes: 5, media: commentMediaFiles.map((file) => file.localPath) }]
            : [],
          targets: facebookTargets.map(([targetAccountId, config]) => ({
            targetAccountId,
            scheduleMode: "fixed",
            fixedTime: config.mode === "schedule" ? config.scheduledAt : undefined
          }))
        };
        const created = await apiPost<CreatePostResponse>("/facebook/posts", postPayload);
        fbPostId = created.post.id;

        const queued = await apiPost<{ scheduledAt: string }>(`/facebook/posts/${created.post.id}/queue`, {
          mode: hasScheduledTarget ? "schedule" : "now",
          targets: facebookTargets.map(([targetId, config]) => ({
            targetId,
            mode: config.mode,
            scheduledAt: config.mode === "schedule" ? config.scheduledAt : undefined
          }))
        });
        scheduledAt = queued.scheduledAt;
      }

      // Build platform tag for content record (mixed = first platform, or 'multi')
      const platforms = [...new Set(selectedTargets.map(([id]) => targetAccounts.find((a) => a.id === id)?.platform ?? "unknown"))];
      const contentPlatform = platforms.length === 1 ? platforms[0]! : primaryPlatform;

      const allTargetIds = selectedTargets.map(([targetId]) => targetId);

      const contentCreated = await apiPost<ContentResponse>("/contents/manual", {
        originalText: form.content.trim(),
        platform: contentPlatform,
        type: form.type,
        comment: form.comment.trim() || undefined,
        mediaPaths: mediaFiles.map((file) => file.localPath),
        commentMedia: commentMediaFiles.map((file) => file.localPath),
        ...(fbPostId ? { fbPostId } : {}),
        targetIds: nonFacebookTargets.length > 0 ? allTargetIds : allTargetIds,
        scheduledAt,
        status: hasScheduledTarget ? "scheduled" : "publishing",
        mode: hasScheduledTarget ? "schedule" : "now"
      });

      // For non-Facebook targets, trigger publish directly via the contents publish route
      if (nonFacebookTargets.length > 0 && !hasScheduledTarget) {
        await apiPost<{ queued: boolean }>(`/contents/${contentCreated.content.code}/publish`, {
          targetIds: nonFacebookTargets.map(([id]) => id)
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

  const selectedTargetCount = Object.values(targetSchedules).filter((config) => config.enabled).length;

  // Group targets by platform for display
  const targetsByPlatform = useMemo(() => {
    const map: Record<string, TargetAccount[]> = {};
    for (const account of targetAccounts) {
      if (!map[account.platform]) map[account.platform] = [];
      map[account.platform]!.push(account);
    }
    return map;
  }, [targetAccounts]);

  return (
    <>
      <PageHeader
        title="Nhập bài đăng"
        subtitle="Nhập bài viết tay, upload media thật, chọn tài khoản và lịch riêng cho từng tài khoản."
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

      <div className="composer-layout">
        <SectionCard title="1. Chọn tài khoản đăng" description="Chọn account trước. Sau khi chọn account, loại bài và rule media sẽ tự rõ ràng hơn." className="composer-main-card">
        {targetAccounts.length === 0 ? (
          <EmptyState title="Chưa có tài khoản đăng bài nào" description="Hãy vào mục Tài khoản đăng bài để tạo account trước." />
        ) : (
          <div className="target-schedule-list">
            {Object.entries(targetsByPlatform).map(([platform, accounts]) => (
              <div key={platform} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Badge tone={PLATFORM_BADGE_TONE[platform] ?? "neutral"}>{getPlatformLabel(platform)}</Badge>
                  {platform === "threads" ? (
                    <small style={{ color: "#68746d" }}>Threads chỉ hỗ trợ feed.</small>
                  ) : null}
                </div>
                {accounts.map((account) => {
                  const config = targetSchedules[account.id] ?? { enabled: false, mode: "now", scheduledAt: "" };
                  return (
                    <div key={account.id} className={`target-schedule-card ${config.enabled ? "active" : ""}`}>
                      <div className="target-schedule-head">
                        <label className="target-toggle">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(event) => {
                              setTargetSchedules((current) => ({
                                ...current,
                                [account.id]: {
                                  ...(current[account.id] ?? { mode: "now", scheduledAt: "" }),
                                  enabled: event.target.checked
                                }
                              }));
                            }}
                          />
                          <span>{account.name}</span>
                          <Badge tone={PLATFORM_BADGE_TONE[account.platform] ?? "neutral"}>
                            {getPlatformLabel(account.platform)}
                          </Badge>
                        </label>
                        <small>
                          {account.isActive ? "Đang bật" : "Đang tắt"} • health: {account.health}
                        </small>
                      </div>

                      {config.enabled ? (
                        <div className="target-schedule-controls">
                          <div className="field compact-field">
                            <Label>Chế độ</Label>
                            <Select
                              value={config.mode}
                              onChange={(event) => {
                                const mode = event.target.value as "now" | "schedule";
                                setTargetSchedules((current) => ({
                                  ...current,
                                  [account.id]: { ...config, mode }
                                }));
                              }}
                            >
                              <option value="now">Đăng ngay</option>
                              <option value="schedule">Hẹn lịch</option>
                            </Select>
                          </div>
                          <div className="field compact-field">
                            <Label>Thời gian</Label>
                            <Input
                              type="datetime-local"
                              value={config.scheduledAt}
                              disabled={config.mode !== "schedule"}
                              onChange={(event) => {
                                setTargetSchedules((current) => ({
                                  ...current,
                                  [account.id]: { ...config, scheduledAt: event.target.value }
                                }));
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="2. Nội dung bài đăng" className="composer-main-card">
        <div className="composer-form-grid">
          <div className="field compact-field">
            <Label htmlFor="post-type">Loại bài</Label>
            <Select
              id="post-type"
              value={form.type}
              onChange={(event) => {
                setError(null);
                setMediaFiles([]);
                setForm((current) => ({ ...current, type: event.target.value }));
              }}
            >
              {postTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>

          <div className="field compact-field">
            <Label>Tài khoản đã chọn</Label>
            <div className="selection-summary">
              <strong>{selectedTargetCount}</strong>
              <span>account</span>
            </div>
          </div>

          <div className="field full">
            <Label htmlFor="post-content">Nội dung</Label>
            <Textarea id="post-content" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="Nhập nội dung bài đăng..." rows={6} className="composer-textarea" />
          </div>

          <div className="field full">
            <div className="inline-head">
              <Label>Media</Label>
              <Button type="button" variant="secondary" size="sm" icon={<Upload aria-hidden />} onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                Upload file
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
                for (const file of files) {
                  uploadMutation.mutate({ file, kind: "post" });
                }
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
            <small className="field-help">
              {enabledAccountPlatforms.length === 1
                ? mediaHint(enabledAccountPlatforms[0]!, form.type)
                : mediaHint("facebook", form.type)}
            </small>
          </div>

          <div className="field full">
            <Label htmlFor="post-comment">Comment đầu tiên</Label>
            <Textarea id="post-comment" value={form.comment} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} rows={3} className="composer-textarea composer-textarea-sm" />
          </div>

          <div className="field full">
            <div className="inline-head">
              <Label>Media comment</Label>
              <Button type="button" variant="secondary" size="sm" icon={<Upload aria-hidden />} onClick={() => commentFileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                Upload file
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
                for (const file of files) {
                  uploadMutation.mutate({ file, kind: "comment" });
                }
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
        </div>

        <div className="actions composer-actions" style={{ marginTop: 16 }}>
          <Button icon={<Send aria-hidden />} onClick={() => { setError(null); submitMutation.mutate(); }} disabled={selectedTargetCount === 0 || submitMutation.isPending || uploadMutation.isPending}>
            {submitMutation.isPending ? "Đang xử lý..." : "Lưu và chạy"}
          </Button>
          <div className="actions-note">Đã chọn {selectedTargetCount} tài khoản</div>
        </div>
      </SectionCard>
      </div>

    </>
  );
}
