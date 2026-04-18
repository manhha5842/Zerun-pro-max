import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Brain, Download, Play, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { AccountForm, type AccountFormValues } from "./accountForms";

type Source = {
  id: string;
  name: string;
  platform: string;
  handle?: string;
  health: string;
  isActive: boolean;
  lastCrawledAt?: string;
};

export function CrawlDataPage() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const query = useQuery({ queryKey: ["sources"], queryFn: () => apiGet<{ sources: Source[] }>("/sources") });

  const create = useMutation({
    mutationFn: (values: AccountFormValues) => apiPost("/sources", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      setFeedback({ type: "success", message: "Đã thêm tài khoản nguồn crawl." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const crawl = useMutation({
    mutationFn: (id: string) => apiPost(`/sources/${id}/crawl`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      setFeedback({ type: "success", message: "Đã đưa nguồn vào hàng đợi crawl." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Crawl data</h1>
          <p className="page-subtitle">Tài khoản nguồn và luồng thu thập nội dung được tách riêng khỏi quản lý tài khoản đăng bài.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "Đang tải..." : "Làm mới"}
        </Button>
      </header>

      <section className="feature-grid" style={{ marginBottom: 18 }}>
        <div className="panel panel-pad feature-card">
          <div className="feature-card-head">
            <Brain aria-hidden />
            <strong>Tối ưu nội dung sau crawl</strong>
          </div>
          <p className="muted-copy">Chuẩn bị khu vực để rewrite/optimistic nội dung sau khi crawl trước khi đưa sang đăng bài.</p>
          <div className="inline-note">
            <Sparkles aria-hidden size={14} />
            <span>UI đã tách flow. Bước tối ưu sâu sẽ nối thêm vào API xử lý nội dung.</span>
          </div>
        </div>

        <div className="panel panel-pad feature-card">
          <div className="feature-card-head">
            <ArrowRight aria-hidden />
            <strong>Đẩy thẳng sang luồng đăng</strong>
          </div>
          <p className="muted-copy">Sau crawl có thể chọn nội dung để đưa trực tiếp sang tài khoản đăng hoặc campaign phù hợp.</p>
          <Button variant="secondary" disabled>
            Sắp nối flow đăng ngay
          </Button>
        </div>

        <div className="panel panel-pad feature-card">
          <div className="feature-card-head">
            <Download aria-hidden />
            <strong>Xuất Excel để import lại</strong>
          </div>
          <p className="muted-copy">Giữ đúng luồng bạn muốn: crawl xong có thể xuất file Excel để rà lại và import vào thư viện bài viết.</p>
          <Button variant="secondary" disabled>
            Sắp nối export Excel
          </Button>
        </div>
      </section>

      {feedback ? <div className={`banner ${feedback.type}`}>{feedback.message}</div> : null}

      <section className="split split-wide">
        <div className="panel">
          <div className="section-block-head">
            <div>
              <h2>Tài khoản nguồn crawl</h2>
              <p className="muted-copy">Chỉ các tài khoản dùng để lấy dữ liệu đầu vào. Không trộn với tài khoản đăng.</p>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Nền tảng</th>
                <th>Handle</th>
                <th>Sức khỏe</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.sources ?? []).map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.name}</strong>
                    <div className="table-subtle">{source.isActive ? "Đang bật" : "Đang tắt"}</div>
                  </td>
                  <td>{source.platform}</td>
                  <td>{source.handle || <span className="table-subtle">Chưa có</span>}</td>
                  <td>
                    <StatusBadge status={source.health} />
                  </td>
                  <td>
                    <Button variant="secondary" icon={<Play aria-hidden />} onClick={() => crawl.mutate(source.id)} disabled={crawl.isPending}>
                      {crawl.isPending ? "Đang queue..." : "Crawl"}
                    </Button>
                  </td>
                </tr>
              ))}
              {query.data && query.data.sources.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">Chưa có tài khoản nguồn nào.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <AccountForm
          label="Thêm tài khoản nguồn"
          description="Khu vực riêng cho crawl data. Source account không còn nằm trong flow lưu tài khoản đăng bài."
          submitLabel="Thêm nguồn"
          fixedKind="source"
          isSubmitting={create.isPending}
          submitError={create.error instanceof Error ? create.error.message : undefined}
          submitSuccess={feedback?.type === "success" ? feedback.message : undefined}
          onSubmit={async (values) => {
            setFeedback(null);
            await create.mutateAsync(values);
          }}
        />
      </section>

      <section className="panel panel-pad" style={{ marginTop: 18 }}>
        <div className="feature-card-head">
          <Wand2 aria-hidden />
          <strong>Flow mục tiêu theo style auto_post_agent</strong>
        </div>
        <ol className="note-list">
          <li>Thêm tài khoản nguồn crawl tại đây.</li>
          <li>Chạy crawl để lấy dữ liệu.</li>
          <li>Tối ưu/chỉnh nội dung sau crawl.</li>
          <li>Chọn đẩy sang đăng ngay hoặc xuất Excel để import lại.</li>
        </ol>
      </section>
    </>
  );
}
