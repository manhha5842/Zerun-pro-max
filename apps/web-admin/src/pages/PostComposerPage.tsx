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

  const facebookTargets = useMemo<TargetAccount[]>(() => {
    return (accountsQuery.data?.accounts ?? [])
      .filter((account) => account.kind === "target" && account.platform === "facebook")
      .map((account) => ({
        id: account.id,
        name: account.name,
        platform: account.platform,
        isActive: account.isActive,
        health: account.health
      }));
  }, [accountsQuery.data]);

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
      if (!selectedTargets.length) throw new Error("Cần chọn ít nhất một tài khoản Facebook.");

      if (form.type === "story") {
        if (mediaFiles.length !== 1 || !mediaFiles.every(isImageType)) {
          throw new Error("Story cần đúng 1 ảnh.");
        }
      }

      if (form.type === "reel") {
        if (mediaFiles.length !== 1 || !mediaFiles.every(isVideoType)) {
          throw new Error("Reel cần đúng 1 video.");
        }
      }

      const hasScheduledTarget = selectedTargets.some(([, config]) => config.mode === "schedule");
      const invalidScheduledTarget = selectedTargets.find(([, config]) => config.mode === "schedule" && !config.scheduledAt);
      if (invalidScheduledTarget) {
        throw new Error("Có tài khoản đang chọn hẹn lịch nhưng chưa nhập thời gian.");
      }

      const contentCreated = await apiPost<ContentResponse>("/contents/manual", {
        originalText: form.content.trim(),
        platform: "facebook",
        type: form.type,
        comment: form.comment.trim() || undefined,
        mediaPaths: mediaFiles.map((file) => file.localPath),
        commentMedia: commentMediaFiles.map((file) => file.localPath)
      });

      const postPayload = {
        type: form.type,
        caption: form.content.trim(),
        media: mediaFiles.map((file) => ({
          localPath: file.localPath,
          mimeType: file.mimeType
        })),
        comments: form.comment.trim() ? [{ text: form.comment.trim(), delayMinutes: 5, media: commentMediaFiles.map((file) => file.localPath) }] : [],
        targets: selectedTargets.map(([targetAccountId, config]) => ({
          targetAccountId,
          scheduleMode: "fixed",
          fixedTime: config.mode === "schedule" ? config.scheduledAt : undefined
        }))
      };

      const created = await apiPost<CreatePostResponse>("/facebook/posts", postPayload);
      await apiPost(`/facebook/posts/${created.post.id}/queue`, {
        mode: hasScheduledTarget ? "schedule" : "now",
        targets: selectedTargets.map(([targetId, config]) => ({
          targetId,
          mode: config.mode,
          scheduledAt: config.mode === "schedule" ? config.scheduledAt : undefined
        }))
      });

      return {
        postId: created.post.id,
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

  return (
    <>
      <PageHeader
        title="Nhập bài đăng"
        subtitle="Nhập bài viết tay, upload media thật, chọn tài khoản Facebook và lịch riêng cho từng tài khoản."
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

      <SectionCard title="Nội dung bài đăng">
        <div className="form-grid">
          <div className="field">
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
              <option value="feed">Feed</option>
              <option value="story">Story</option>
              <option value="reel">Reel</option>
            </Select>
          </div>
          <div className="field full">
            <Label htmlFor="post-content">Nội dung</Label>
            <Textarea id="post-content" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="Nhập nội dung bài đăng..." rows={8} />
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
            <div className="upload-list">
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
              {form.type === "story" ? "Story chỉ nhận đúng 1 ảnh." : form.type === "reel" ? "Reel chỉ nhận đúng 1 video." : "Feed có thể có nhiều media."}
            </small>
          </div>
          <div className="field full">
            <Label htmlFor="post-comment">Comment đầu tiên</Label>
            <Textarea id="post-comment" value={form.comment} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} rows={3} />
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
            <div className="upload-list compact">
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
      </SectionCard>

      <SectionCard title="Tài khoản đăng" description="Mỗi tài khoản có thể đăng ngay hoặc hẹn giờ riêng." style={{ marginTop: 16 }}>
        {facebookTargets.length === 0 ? (
          <EmptyState title="Chưa có tài khoản Facebook nào" description="Hãy vào mục Tài khoản đăng bài để tạo account Facebook trước." />
        ) : (
          <div className="target-schedule-list">
            {facebookTargets.map((account) => {
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
                    </label>
                    <small>
                      {account.isActive ? "Đang bật" : "Đang tắt"} • health: {account.health}
                    </small>
                  </div>

                  {config.enabled ? (
                    <div className="target-schedule-controls">
                      <div className="field">
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
                      <div className="field">
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
        )}

        <div className="actions" style={{ marginTop: 16 }}>
          <Button icon={<Send aria-hidden />} onClick={() => { setError(null); submitMutation.mutate(); }} disabled={selectedTargetCount === 0 || submitMutation.isPending || uploadMutation.isPending}>
            {submitMutation.isPending ? "Đang xử lý..." : "Lưu và chạy"}
          </Button>
          <div className="actions-note">Đã chọn {selectedTargetCount} tài khoản</div>
        </div>
      </SectionCard>
    </>
  );
}
