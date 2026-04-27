import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiPostForm } from "../api/client";
import { FileUploadDropzone } from "../components/common/FileUploadDropzone";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";

type Account = {
  id: string;
  kind: "source" | "target";
  name: string;
  platform: string;
  health: string;
  isActive: boolean;
};

type UploadedFile = {
  filename: string;
  localPath: string;
  mimeType: string;
};

export function PostComposerPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"manual" | "bulk">("manual");
  const [manual, setManual] = useState({
    targetId: "",
    postType: "feed",
    content: "",
    includeFirstComment: false,
    comment: "",
    mode: "now",
    scheduledAt: ""
  });
  const [mediaFiles, setMediaFiles] = useState<UploadedFile[]>([]);
  const [commentMediaFiles, setCommentMediaFiles] = useState<UploadedFile[]>([]);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [mediaZip, setMediaZip] = useState<File | null>(null);
  const [bulk, setBulk] = useState({
    targetId: "",
    scheduleMode: "now",
    scheduledAt: "",
    caption: "caption",
    mediaPaths: "media paths",
    comments: "comments",
    commentMediaPaths: "comment media paths",
    scheduleTime: "schedule time",
    postType: "post type"
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/accounts")
  });
  const targets = useMemo(() => (accountsQuery.data?.accounts ?? []).filter((account) => account.kind === "target"), [accountsQuery.data]);
  const selectedTarget = targets.find((target) => target.id === manual.targetId);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: "post" | "comment" }) => {
      const body = new FormData();
      body.append("file", file);
      const data = await apiPostForm<{ file: UploadedFile }>("/uploads/manual", body);
      return { file: data.file, kind };
    },
    onSuccess: ({ file, kind }) => {
      if (kind === "post") setMediaFiles((current) => [...current, file]);
      else setCommentMediaFiles((current) => [...current, file]);
    }
  });

  const submitManualMutation = useMutation({
    mutationFn: async () => {
      if (!manual.targetId) throw new Error("Cần chọn tài khoản đăng.");
      if (!manual.content.trim()) throw new Error("Cần nhập nội dung bài đăng.");
      const target = targets.find((item) => item.id === manual.targetId);
      const content = await apiPost<{ content: { code: string } }>("/contents/manual", {
        originalText: manual.content.trim(),
        platform: target?.platform ?? "manual",
        type: manual.postType,
        comment: manual.includeFirstComment ? manual.comment : undefined,
        mediaPaths: mediaFiles.map((file) => file.localPath),
        commentMedia: manual.includeFirstComment ? commentMediaFiles.map((file) => file.localPath) : [],
        targetIds: [manual.targetId],
        scheduledAt: manual.mode === "schedule" ? manual.scheduledAt : undefined,
        status: manual.mode === "schedule" ? "scheduled" : "ready_to_publish",
        mode: manual.mode
      });
      if (manual.mode === "now") await apiPost(`/contents/${content.content.code}/publish`, { targetIds: [manual.targetId] });
      return content.content.code;
    },
    onSuccess: (code) => navigate(`/contents/${code}`)
  });

  const submitBulkMutation = useMutation({
    mutationFn: async () => {
      if (!bulkFile) throw new Error("Cần chọn file Excel/CSV.");
      if (!bulk.targetId) throw new Error("Cần chọn tài khoản đăng.");
      const target = targets.find((item) => item.id === bulk.targetId);
      const body = new FormData();
      body.append("file", bulkFile);
      if (mediaZip) body.append("mediaZip", mediaZip);
      body.append("targetIds", JSON.stringify([bulk.targetId]));
      body.append("platform", target?.platform ?? "manual");
      body.append("scheduleMode", bulk.scheduleMode);
      body.append("scheduledAt", bulk.scheduledAt);
      body.append("mapping", JSON.stringify({
        caption: bulk.caption,
        mediaPaths: bulk.mediaPaths,
        comments: bulk.comments,
        commentMediaPaths: bulk.commentMediaPaths,
        scheduleTime: bulk.scheduleTime,
        postType: bulk.postType
      }));
      return apiPostForm<{ created: unknown[]; failed: unknown[]; total: number }>("/contents/bulk-import", body);
    },
    onSuccess: () => navigate("/contents")
  });

  return (
    <>
      <PageHeader
        title="Tạo bài viết"
        subtitle="Tạo thủ công một bài hoặc import hàng loạt Excel/CSV/media zip trong cùng flow đăng bài."
        actions={<Link to="/contents"><Button variant="secondary">Mở danh sách bài viết</Button></Link>}
      />

      <div className="tabs">
        <button type="button" className={tab === "manual" ? "active" : ""} onClick={() => setTab("manual")}>Tạo thủ công</button>
        <button type="button" className={tab === "bulk" ? "active" : ""} onClick={() => setTab("bulk")}>Import hàng loạt</button>
      </div>

      {tab === "manual" ? (
        <SectionCard title="Tạo thủ công">
          <div className="form-grid">
            <label>
              <Label>Account đăng</Label>
              <Select value={manual.targetId} onChange={(event) => setManual((current) => ({ ...current, targetId: event.target.value }))}>
                <option value="">Chọn tài khoản</option>
                {targets.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.platform}</option>)}
              </Select>
            </label>
            <label>
              <Label>Loại bài</Label>
              <Select value={manual.postType} onChange={(event) => setManual((current) => ({ ...current, postType: event.target.value }))}>
                <option value="feed">Feed</option>
                <option value="story">Story</option>
                <option value="reel">Reel</option>
              </Select>
            </label>
            <label className="span-2">
              <Label>Nội dung</Label>
              <Textarea value={manual.content} onChange={(event) => setManual((current) => ({ ...current, content: event.target.value }))} placeholder="Nhập caption tiếng Việt có dấu..." />
            </label>
            <div className="span-2">
              <FileUploadDropzone label="Upload media bài viết" accept="image/*,video/*" multiple onChange={(files) => files.forEach((file) => uploadMutation.mutate({ file, kind: "post" }))} />
              <div className="file-list">{mediaFiles.map((file) => <Badge key={file.localPath}>{file.filename}</Badge>)}</div>
            </div>
            <label>
              <Label>Comment đầu tiên</Label>
              <Select value={manual.includeFirstComment ? "yes" : "no"} onChange={(event) => setManual((current) => ({ ...current, includeFirstComment: event.target.value === "yes" }))}>
                <option value="no">Không dùng</option>
                <option value="yes">Có comment đầu tiên</option>
              </Select>
            </label>
            <label>
              <Label>Giờ đăng</Label>
              <Select value={manual.mode} onChange={(event) => setManual((current) => ({ ...current, mode: event.target.value }))}>
                <option value="now">Đăng ngay</option>
                <option value="schedule">Hẹn lịch</option>
              </Select>
            </label>
            {manual.includeFirstComment ? (
              <>
                <label className="span-2">
                  <Label>Nội dung comment</Label>
                  <Textarea value={manual.comment} onChange={(event) => setManual((current) => ({ ...current, comment: event.target.value }))} />
                </label>
                <div className="span-2">
                  <FileUploadDropzone label="Upload media comment" accept="image/*,video/*" multiple onChange={(files) => files.forEach((file) => uploadMutation.mutate({ file, kind: "comment" }))} />
                  <div className="file-list">{commentMediaFiles.map((file) => <Badge key={file.localPath}>{file.filename}</Badge>)}</div>
                </div>
              </>
            ) : null}
            {manual.mode === "schedule" ? (
              <label>
                <Label>Thời gian đăng</Label>
                <Input type="datetime-local" value={manual.scheduledAt} onChange={(event) => setManual((current) => ({ ...current, scheduledAt: event.target.value }))} />
              </label>
            ) : null}
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <Button onClick={() => submitManualMutation.mutate()} disabled={submitManualMutation.isPending}>
              {manual.mode === "now" ? "Submit và đăng ngay" : "Submit lịch đăng"}
            </Button>
            {selectedTarget ? <Badge>{selectedTarget.platform} · {selectedTarget.health}</Badge> : null}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Import hàng loạt" description="Upload Excel/CSV và media zip, mapping cột rồi commit import lịch.">
          <div className="form-grid">
            <div>
              <FileUploadDropzone label="Upload Excel/CSV" accept=".xlsx,.xls,.csv" onChange={(files) => setBulkFile(files[0] ?? null)} />
              {bulkFile ? <p className="table-subtle">Đã chọn: {bulkFile.name}</p> : null}
            </div>
            <div>
              <FileUploadDropzone label="Upload media zip optional" accept=".zip" onChange={(files) => setMediaZip(files[0] ?? null)} />
              {mediaZip ? <p className="table-subtle">Đã chọn: {mediaZip.name}</p> : null}
            </div>
            <label>
              <Label>Account đăng</Label>
              <Select value={bulk.targetId} onChange={(event) => setBulk((current) => ({ ...current, targetId: event.target.value }))}>
                <option value="">Chọn tài khoản</option>
                {targets.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.platform}</option>)}
              </Select>
            </label>
            <label>
              <Label>Schedule mode</Label>
              <Select value={bulk.scheduleMode} onChange={(event) => setBulk((current) => ({ ...current, scheduleMode: event.target.value }))}>
                <option value="now">Đăng ngay</option>
                <option value="fixed">Giờ cố định</option>
                <option value="spread">Rải lịch theo khoảng</option>
                <option value="random">Random trong khoảng</option>
              </Select>
            </label>
            {bulk.scheduleMode === "fixed" ? (
              <label>
                <Label>Giờ cố định</Label>
                <Input type="datetime-local" value={bulk.scheduledAt} onChange={(event) => setBulk((current) => ({ ...current, scheduledAt: event.target.value }))} />
              </label>
            ) : null}
            {(["caption", "mediaPaths", "comments", "commentMediaPaths", "scheduleTime", "postType"] as const).map((key) => (
              <label key={key}>
                <Label>{key}</Label>
                <Input value={bulk[key]} onChange={(event) => setBulk((current) => ({ ...current, [key]: event.target.value }))} />
              </label>
            ))}
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <Button onClick={() => submitBulkMutation.mutate()} disabled={submitBulkMutation.isPending || !bulkFile}>Hoàn thành import lịch</Button>
          </div>
        </SectionCard>
      )}
    </>
  );
}
