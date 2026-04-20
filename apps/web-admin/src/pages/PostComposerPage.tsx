import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, FilePlus2, Send, Upload } from "lucide-react";
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

type CreatePostResponse = {
  post: {
    id: string;
    status: string;
  };
};

export function PostComposerPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    type: "feed",
    content: "",
    mediaText: "",
    comment: "",
    commentMediaText: "",
    scheduledAt: "",
    selectedTargets: [] as string[]
  });
  const [result, setResult] = useState<{ postId: string; mode: "now" | "schedule"; scheduledAt?: string } | null>(null);

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

  const submitMutation = useMutation({
    mutationFn: async (mode: "now" | "schedule") => {
      const mediaPaths = form.mediaText
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

      const commentMediaPaths = form.commentMediaText
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

      const postPayload = {
        type: form.type,
        caption: form.content.trim(),
        media: mediaPaths.map((localPath) => ({
          localPath,
          mimeType: form.type === "reel" ? "video/mp4" : "image/jpeg"
        })),
        comments: form.comment.trim() ? [{ text: form.comment.trim(), delayMinutes: 5, media: commentMediaPaths }] : [],
        targets: form.selectedTargets.map((targetAccountId) => ({
          targetAccountId,
          scheduleMode: "fixed"
        }))
      };

      const created = await apiPost<CreatePostResponse>("/facebook/posts", postPayload);
      const queued = await apiPost<{ queued: number; scheduledAt: string; mode: "now" | "schedule" }>(`/facebook/posts/${created.post.id}/queue`, {
        mode,
        scheduledAt: mode === "schedule" ? form.scheduledAt : undefined
      });

      return { postId: created.post.id, ...queued };
    },
    onSuccess: (data) => {
      setResult(data);
      setForm({
        type: "feed",
        content: "",
        mediaText: "",
        comment: "",
        commentMediaText: "",
        scheduledAt: "",
        selectedTargets: []
      });
      void queryClient.invalidateQueries({ queryKey: ["contents"] });
    }
  });

  const canSubmitNow = form.content.trim() && form.selectedTargets.length > 0;
  const canSchedule = canSubmitNow && form.scheduledAt;

  return (
    <>
      <PageHeader
        title="Nhập bài đăng"
        subtitle="Nhập bài viết tay, chọn tài khoản Facebook, rồi đăng ngay hoặc hẹn lịch trong một chỗ."
        actions={
          <Button variant="secondary" icon={<Upload aria-hidden />} onClick={() => void queryClient.invalidateQueries({ queryKey: ["accounts"] })}>
            Làm mới tài khoản
          </Button>
        }
      />

      {result ? (
        <SectionCard className="mb-4" style={{ marginBottom: 16 }}>
          <div className="field-success" role="status">
            <CheckCircle2 aria-hidden size={14} />
            <span>
              Đã tạo bài đăng <strong>{result.postId}</strong> và {result.mode === "schedule" ? `hẹn lịch lúc ${new Date(result.scheduledAt ?? "").toLocaleString("vi-VN")}` : "xếp hàng đăng ngay"}.
            </span>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Nội dung bài đăng" description="Bản đầu tiên làm cho Facebook. Media nhập theo đường dẫn local, mỗi dòng một file.">
        <div className="form-grid">
          <div className="field">
            <Label htmlFor="post-type">Loại bài</Label>
            <Select id="post-type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
              <option value="feed">Feed</option>
              <option value="story">Story</option>
              <option value="reel">Reel</option>
            </Select>
          </div>
          <div className="field">
            <Label htmlFor="post-scheduled-at">Hẹn đăng</Label>
            <Input id="post-scheduled-at" type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} />
          </div>
          <div className="field full">
            <Label htmlFor="post-content">Nội dung</Label>
            <Textarea id="post-content" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="Nhập nội dung bài đăng..." rows={8} />
          </div>
          <div className="field full">
            <Label htmlFor="post-media">Media</Label>
            <Textarea id="post-media" value={form.mediaText} onChange={(event) => setForm((current) => ({ ...current, mediaText: event.target.value }))} placeholder={"Mỗi dòng một file, ví dụ:\nC:\\media\\image-1.jpg\nC:\\media\\image-2.jpg"} rows={5} />
          </div>
          <div className="field full">
            <Label htmlFor="post-comment">Comment đầu tiên</Label>
            <Textarea id="post-comment" value={form.comment} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} placeholder="Comment sẽ được đăng sau bài chính." rows={3} />
          </div>
          <div className="field full">
            <Label htmlFor="post-comment-media">Media comment</Label>
            <Textarea id="post-comment-media" value={form.commentMediaText} onChange={(event) => setForm((current) => ({ ...current, commentMediaText: event.target.value }))} placeholder={"Nếu có, mỗi dòng một file media cho comment."} rows={3} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Tài khoản đăng" description="Chọn một hoặc nhiều tài khoản Facebook sẽ dùng để đăng bài này." style={{ marginTop: 16 }}>
        {facebookTargets.length === 0 ? (
          <EmptyState title="Chưa có tài khoản Facebook nào" description="Hãy vào mục Tài khoản đăng bài để tạo account Facebook trước." />
        ) : (
          <div className="choice-grid">
            {facebookTargets.map((account) => {
              const checked = form.selectedTargets.includes(account.id);
              return (
                <label key={account.id} className={`choice-card ${checked ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        selectedTargets: event.target.checked
                          ? [...current.selectedTargets, account.id]
                          : current.selectedTargets.filter((id) => id !== account.id)
                      }));
                    }}
                    style={{ display: "none" }}
                  />
                  <div className="choice-title">
                    <FilePlus2 aria-hidden size={16} />
                    <span>{account.name}</span>
                  </div>
                  <small>
                    {account.isActive ? "Đang bật" : "Đang tắt"} • health: {account.health}
                  </small>
                </label>
              );
            })}
          </div>
        )}

        <div className="actions" style={{ marginTop: 16 }}>
          <Button icon={<Send aria-hidden />} onClick={() => submitMutation.mutate("now")} disabled={!canSubmitNow || submitMutation.isPending}>
            {submitMutation.isPending ? "Đang xử lý..." : "Đăng ngay"}
          </Button>
          <Button variant="secondary" icon={<CalendarClock aria-hidden />} onClick={() => submitMutation.mutate("schedule")} disabled={!canSchedule || submitMutation.isPending}>
            Hẹn lịch đăng
          </Button>
        </div>
      </SectionCard>
    </>
  );
}
