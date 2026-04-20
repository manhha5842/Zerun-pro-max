import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, Send, XCircle } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api/client";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { SectionCard } from "../components/common/SectionCard";

type DetailData = {
  content: {
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
};

export function ContentDetailPage({ editMode = false }: { editMode?: boolean }) {
  const { code } = useParams();
  const queryClient = useQueryClient();
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null);
  const detail = useQuery({ queryKey: ["content", code], queryFn: () => apiGet<DetailData>(`/contents/${code}`), enabled: Boolean(code) });
  const draft = useMutation({
    mutationFn: (draftText: string) => apiPut(`/contents/${code}/draft`, { draftText }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content", code] })
  });
  const publish = useMutation({
    mutationFn: () => apiPost<{ queued: boolean; targetCount: number }>(`/contents/${code}/publish`, { targetIds: detail.data?.content.scheduledTargets ?? [] }),
    onSuccess: (data) => {
      setPublishResult({ success: true, message: `Đã đưa vào hàng chờ đăng cho ${data.targetCount} tài khoản.` });
      void queryClient.invalidateQueries({ queryKey: ["content", code] });
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["content", code] });
      }, 2000);
    },
    onError: (error) => {
      setPublishResult({ success: false, message: error instanceof Error ? error.message : "Không thể đăng bài." });
    }
  });

  const content = detail.data?.content;

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    draft.mutate(String(form.get("draftText") ?? ""));
  }

  return (
    <>
      <header className="page-head">
        <div>
          <p>
            <Link to="/contents">← Quay lại</Link>
          </p>
          <h1 className="page-title">{content?.code ?? "Nội dung"}</h1>
          {content ? <Badge tone={content.status === "published" ? "good" : content.status === "failed" ? "danger" : "warn"}>{content.status}</Badge> : null}
        </div>
        <div className="actions">
          <Button variant="secondary" icon={<CalendarClock aria-hidden />}>
            Lên lịch
          </Button>
          <Button icon={<Send aria-hidden />} onClick={() => publish.mutate()} disabled={publish.isPending}>
            Đăng ngay
          </Button>
        </div>
      </header>

      {publishResult ? (
        <SectionCard style={{ marginBottom: 16 }}>
          <div className={publishResult.success ? "field-success" : "field-error"} role={publishResult.success ? "status" : "alert"}>
            {publishResult.success ? <CheckCircle2 aria-hidden size={14} /> : <XCircle aria-hidden size={14} />}
            <span>{publishResult.message}</span>
          </div>
        </SectionCard>
      ) : null}

      <section className="split">
        <div className="panel panel-pad">
          <h2>Bản gốc</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{content?.originalText}</p>
          <h3>Link đã phát hiện</h3>
          <table className="table">
            <tbody>
              {(content?.links ?? []).map((link) => (
                <tr key={link.id}>
                  <td>{link.network}</td>
                  <td>{link.originalUrl}</td>
                  <td>{link.convertedUrl ?? link.error ?? "Chưa chuyển"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="panel panel-pad" onSubmit={saveDraft}>
          <h2>Bản nháp / cuối</h2>
          <label className="field">
            <span>Nội dung đăng</span>
            <textarea name="draftText" defaultValue={content?.draftText ?? content?.finalText ?? content?.originalText ?? ""} readOnly={!editMode} />
          </label>
          <div className="actions" style={{ marginTop: 12 }}>
            <Button type="submit" disabled={!editMode || draft.isPending}>
              Lưu bản nháp
            </Button>
            {!editMode ? (
              <Link to={`/contents/${code}/edit`}>
                <Button type="button" variant="secondary">
                  Sửa nội dung
                </Button>
              </Link>
            ) : null}
          </div>

          {content && content.publishAttempts.length > 0 ? (
            <>
              <h3 style={{ marginTop: 24 }}>Lịch sử đăng</h3>
              <div className="publish-attempts">
                {content.publishAttempts.map((attempt) => (
                  <div key={attempt.id} className="publish-attempt-row">
                    <div className="publish-attempt-status">
                      {attempt.status === "success" ? (
                        <CheckCircle2 aria-hidden size={14} style={{ color: "#0f6f5c" }} />
                      ) : attempt.status === "failed" ? (
                        <XCircle aria-hidden size={14} style={{ color: "#b42318" }} />
                      ) : (
                        <span style={{ fontSize: 12, color: "#68746d" }}>•</span>
                      )}
                      <span>{attempt.status}</span>
                    </div>
                    {attempt.resultUrl ? (
                      <a href={attempt.resultUrl} target="_blank" rel="noopener noreferrer" className="publish-attempt-link">
                        Xem bài đăng
                      </a>
                    ) : null}
                    {attempt.error ? <div className="publish-attempt-error">{attempt.error}</div> : null}
                    <div className="publish-attempt-time">{new Date(attempt.createdAt).toLocaleString("vi-VN")}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </form>
      </section>
    </>
  );
}
