import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { AddAccountDialog } from "../components/accounts/AddAccountDialog";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";

type Account = {
  id: string;
  kind: "source" | "target";
  name: string;
  platform: string;
  handle?: string;
  health: string;
  isActive: boolean;
  credentials?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const query = useQuery({ queryKey: ["accounts"], queryFn: () => apiGet<{ accounts: Account[] }>("/accounts") });

  const createSource = useMutation({
    mutationFn: (values: unknown) => apiPost("/sources", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      setFeedback({ type: "success", message: "Đã tạo tài khoản nguồn mới." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const createTarget = useMutation({
    mutationFn: (values: unknown) => apiPost("/targets", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
      setFeedback({ type: "success", message: "Đã tạo tài khoản đích mới." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const test = useMutation({
    mutationFn: (account: Account) => apiPost(`/accounts/${account.id}/test`, { kind: account.kind }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setFeedback({ type: "success", message: "Đã gửi yêu cầu test account." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const remove = useMutation({
    mutationFn: (account: Account) => apiDelete(account.kind === "source" ? `/sources/${account.id}` : `/targets/${account.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
      setFeedback({ type: "success", message: "Đã xoá tài khoản." });
    },
    onError: (error: Error) => setFeedback({ type: "error", message: error.message })
  });

  const stats = useMemo(() => {
    const accounts = query.data?.accounts ?? [];
    return {
      total: accounts.length,
      sources: accounts.filter((account) => account.kind === "source").length,
      targets: accounts.filter((account) => account.kind === "target").length,
      facebookTargets: accounts.filter((account) => account.kind === "target" && account.platform === "facebook").length
    };
  }, [query.data?.accounts]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Tài khoản nền tảng</h1>
          <p className="page-subtitle">Quản lý tập trung tất cả tài khoản nguồn/đích, thêm nhanh Facebook target và kiểm tra session thật trước khi chạy automation.</p>
        </div>
        <div className="actions">
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Đang tải..." : "Làm mới"}
          </Button>
          <Button icon={<Plus aria-hidden />} onClick={() => setDialogOpen(true)}>
            Thêm tài khoản mới
          </Button>
        </div>
      </header>

      <section className="grid-metrics" style={{ marginBottom: 18 }}>
        <div className="panel metric">
          <p className="metric-label">Tổng tài khoản</p>
          <p className="metric-value">{stats.total}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Nguồn crawl</p>
          <p className="metric-value">{stats.sources}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Đích đăng</p>
          <p className="metric-value">{stats.targets}</p>
        </div>
        <div className="panel metric">
          <p className="metric-label">Facebook target</p>
          <p className="metric-value">{stats.facebookTargets}</p>
        </div>
      </section>

      <div className="panel panel-pad" style={{ marginBottom: 18 }}>
        <div className="account-form-header">
          <div>
            <h2 style={{ marginTop: 0 }}>Hướng dẫn nhanh cho Facebook target</h2>
            <p className="muted-copy">Nếu bạn muốn thêm nhiều tài khoản Facebook để đăng bài, hãy chọn <strong>Đích</strong> → <strong>Facebook</strong> trong wizard.</p>
          </div>
        </div>
        <ol className="note-list" style={{ marginTop: 10 }}>
          <li>Đăng nhập Facebook thủ công trong browser/session Playwright một lần.</li>
          <li>Lưu session vào thư mục ví dụ <code>storage/sessions/facebook/account-name</code>.</li>
          <li>Nhập đường dẫn đó vào <code>authPath</code> hoặc <code>sessionDir</code>.</li>
          <li>Dùng nút <strong>Test</strong> để backend kiểm tra sức khoẻ trước khi publish.</li>
        </ol>
      </div>

      {feedback ? <div className={`banner ${feedback.type}`}>{feedback.message}</div> : null}
      {query.error instanceof Error ? <div className="banner error">{query.error.message}</div> : null}

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Loại</th>
              <th>Nền tảng</th>
              <th>Handle</th>
              <th>Sức khỏe</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.accounts ?? []).map((account) => (
              <tr key={`${account.kind}-${account.id}`}>
                <td>
                  <strong>{account.name}</strong>
                  <div className="table-subtle">{account.isActive ? "Đang bật" : "Đang tắt"}</div>
                </td>
                <td>{account.kind === "source" ? "Nguồn" : "Đích"}</td>
                <td>{account.platform}</td>
                <td>{account.handle || <span className="table-subtle">Chưa có</span>}</td>
                <td>
                  <StatusBadge status={account.health} />
                </td>
                <td>
                  <div className="actions">
                    <Button variant="secondary" icon={<ShieldCheck aria-hidden />} onClick={() => test.mutate(account)} disabled={test.isPending || remove.isPending}>
                      {test.isPending ? "Đang test..." : "Test"}
                    </Button>
                    <Button
                      variant="danger"
                      icon={<Trash2 aria-hidden />}
                      onClick={() => {
                        if (window.confirm(`Xoá tài khoản ${account.name}? Hành động này không thể hoàn tác.`)) {
                          remove.mutate(account);
                        }
                      }}
                      disabled={remove.isPending || test.isPending}
                    >
                      {remove.isPending ? "Đang xoá..." : "Xoá"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {query.data && query.data.accounts.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <p>Chưa có tài khoản nào. Hãy dùng nút “Thêm tài khoản mới” để bắt đầu.</p>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AddAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} sourceMutation={createSource} targetMutation={createTarget} />
    </>
  );
}
