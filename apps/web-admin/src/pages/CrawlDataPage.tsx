import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Brain, Download, Play, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
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
  const toast = useToast();

  const query = useQuery({ queryKey: ["sources"], queryFn: () => apiGet<{ sources: Source[] }>("/sources") });

  const create = useMutation({
    mutationFn: (values: AccountFormValues) => apiPost("/sources", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      toast.success("Đã thêm tài khoản nguồn.");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const crawl = useMutation({
    mutationFn: (id: string) => apiPost(`/sources/${id}/crawl`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      toast.success("Đã đưa nguồn vào hàng chờ crawl.");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  return (
    <>
      <PageHeader
        title="Crawl data"
        subtitle="Quản lý tài khoản nguồn và luồng lấy nội dung, tách riêng khỏi tài khoản đăng bài."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Đang tải..." : "Làm mới"}
          </Button>
        }
      />

      <section className="feature-grid feature-grid-tight" style={{ marginBottom: 18 }}>
        <div className="panel panel-pad feature-card">
          <div className="feature-card-head">
            <Brain aria-hidden />
            <strong>Tối ưu nội dung sau crawl</strong>
          </div>
          <p className="muted-copy">Chuẩn bị vùng xử lý lại nội dung sau khi crawl trước khi đưa sang đăng bài.</p>
          <div className="inline-note">
            <Sparkles aria-hidden size={14} />
            <span>Phần UI đã tách riêng. Bước xử lý sâu sẽ nối tiếp vào API sau.</span>
          </div>
        </div>

        <div className="panel panel-pad feature-card">
          <div className="feature-card-head">
            <ArrowRight aria-hidden />
            <strong>Đẩy sang luồng đăng</strong>
          </div>
          <p className="muted-copy">Sau khi crawl xong, có thể chọn nội dung phù hợp để chuyển sang luồng đăng bài.</p>
          <Button variant="secondary" disabled>
            Sẽ nối tiếp
          </Button>
        </div>

        <div className="panel panel-pad feature-card">
          <div className="feature-card-head">
            <Download aria-hidden />
            <strong>Xuất Excel</strong>
          </div>
          <p className="muted-copy">Giữ đúng flow đang dùng: crawl xong có thể xuất file để rà lại rồi import vào thư viện bài viết.</p>
          <Button variant="secondary" disabled>
            Sẽ nối tiếp
          </Button>
        </div>
      </section>

      <section className="split split-wide">
        <SectionCard title="Tài khoản nguồn" description="Chỉ các tài khoản dùng để lấy dữ liệu đầu vào.">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Nền tảng</th>
                <th>Handle</th>
                <th>Trạng thái</th>
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
                    {source.lastCrawledAt ? <div className="table-subtle" style={{ marginTop: 6 }}>Lần gần nhất: {new Date(source.lastCrawledAt).toLocaleString("vi-VN")}</div> : null}
                  </td>
                  <td>
                    <Button variant="secondary" icon={<Play aria-hidden />} onClick={() => crawl.mutate(source.id)} disabled={crawl.isPending}>
                      {crawl.isPending ? "Đang đưa vào hàng chờ..." : "Chạy crawl"}
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
        </SectionCard>

        <AccountForm
          label="Thêm tài khoản nguồn"
          description="Tài khoản nguồn được tạo và quản lý riêng trong khu vực crawl data."
          submitLabel="Thêm nguồn"
          fixedKind="source"
          isSubmitting={create.isPending}
          onSubmit={async (values) => {
            await create.mutateAsync(values);
          }}
        />
      </section>

      <SectionCard title="Flow crawl" description="Luồng làm việc dự kiến, bám theo cấu trúc gọn và tách bước rõ ràng.">
        <div className="feature-card-head">
          <Wand2 aria-hidden />
          <strong>Luồng thao tác</strong>
        </div>
        <ol className="note-list">
          <li>Thêm tài khoản nguồn.</li>
          <li>Chạy crawl để lấy dữ liệu.</li>
          <li>Rà và chỉnh lại nội dung sau crawl.</li>
          <li>Đẩy sang đăng bài hoặc xuất Excel để nhập lại.</li>
        </ol>
      </SectionCard>
    </>
  );
}
