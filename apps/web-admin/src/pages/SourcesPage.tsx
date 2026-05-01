import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
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

export function SourcesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["sources"], queryFn: () => apiGet<{ sources: Source[] }>("/sources") });
  const create = useMutation({
    mutationFn: (values: AccountFormValues) => apiPost("/sources", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Đã thêm nguồn mới.");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const crawl = useMutation({
    mutationFn: (id: string) => apiPost(`/sources/${id}/crawl`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      toast.success("Đã đưa nguồn vào hàng đợi crawl.");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Nguồn crawl</h1>
          <p className="page-subtitle">Giữ form nhanh tại chỗ để thêm account crawl, nhưng nếu cần hướng dẫn nhiều bước hơn hãy dùng trang Tài khoản.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "Đang tải..." : "Làm mới"}
        </Button>
      </header>
      <section className="split">
        <div className="panel">
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
            </tbody>
          </table>
        </div>
        <AccountForm
          label="Thêm nguồn thật"
          description="Phiên bản rút gọn của wizard tạo account tập trung. Dùng tốt cho Telegram, X, Threads, Instagram và Facebook source."
          submitLabel="Thêm nguồn"
          fixedKind="source"
          isSubmitting={create.isPending}
          onSubmit={async (values) => {
            await create.mutateAsync(values);
          }}
        />
      </section>
    </>
  );
}
