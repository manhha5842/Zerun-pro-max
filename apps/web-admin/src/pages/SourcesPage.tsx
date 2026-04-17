import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw } from "lucide-react";
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

export function SourcesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["sources"], queryFn: () => apiGet<{ sources: Source[] }>("/sources") });
  const create = useMutation({
    mutationFn: (values: AccountFormValues) => apiPost("/sources", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] })
  });
  const crawl = useMutation({
    mutationFn: (id: string) => apiPost(`/sources/${id}/crawl`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] })
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Nguồn crawl</h1>
          <p className="page-subtitle">Khai báo tài khoản và session thật cho Telegram, X, Threads, Instagram hoặc Facebook.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>
          Làm mới
        </Button>
      </header>
      <section className="split">
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Nền tảng</th>
                <th>Sức khỏe</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.sources ?? []).map((source) => (
                <tr key={source.id}>
                  <td>{source.name}</td>
                  <td>{source.platform}</td>
                  <td>
                    <StatusBadge status={source.health} />
                  </td>
                  <td>
                    <Button variant="secondary" icon={<Play aria-hidden />} onClick={() => crawl.mutate(source.id)}>
                      Crawl
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AccountForm label="Thêm nguồn thật" onSubmit={(values) => create.mutate(values)} />
      </section>
    </>
  );
}
