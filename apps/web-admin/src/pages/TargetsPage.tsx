import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { AccountForm, type AccountFormValues } from "./accountForms";

type Target = {
  id: string;
  name: string;
  platform: string;
  handle?: string;
  health: string;
  isActive: boolean;
};

export function TargetsPage() {
  const queryClient = useQueryClient();
  const [formFeedback, setFormFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const query = useQuery({ queryKey: ["targets"], queryFn: () => apiGet<{ targets: Target[] }>("/targets") });
  const create = useMutation({
    mutationFn: (values: AccountFormValues) => apiPost("/targets", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setFormFeedback({ type: "success", message: "Đã thêm đích đăng mới." });
    },
    onError: (error: Error) => setFormFeedback({ type: "error", message: error.message })
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Đích đăng</h1>
          <p className="page-subtitle">Mỗi target là một tài khoản, channel, profile hoặc group dùng để publish thật. Với Facebook, bạn có thể nhập authPath/sessionDir ngay tại đây.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "Đang tải..." : "Làm mới"}
        </Button>
      </header>
      {formFeedback ? <div className={`banner ${formFeedback.type}`}>{formFeedback.message}</div> : null}
      <section className="split">
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Nền tảng</th>
                <th>Handle</th>
                <th>Sức khỏe</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.targets ?? []).map((target) => (
                <tr key={target.id}>
                  <td>
                    <strong>{target.name}</strong>
                    <div className="table-subtle">{target.isActive ? "Đang bật" : "Đang tắt"}</div>
                  </td>
                  <td>{target.platform}</td>
                  <td>{target.handle || <span className="table-subtle">Chưa có</span>}</td>
                  <td>
                    <StatusBadge status={target.health} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AccountForm
          label="Thêm đích đăng thật"
          description="Giữ form tại chỗ để giảm thay đổi flow cũ. Nếu muốn wizard tập trung, dùng nút “Thêm tài khoản mới” trong trang Tài khoản."
          submitLabel="Thêm đích đăng"
          fixedKind="target"
          defaultPlatform="facebook"
          isSubmitting={create.isPending}
          submitError={create.error instanceof Error ? create.error.message : undefined}
          submitSuccess={formFeedback?.type === "success" ? formFeedback.message : undefined}
          onSubmit={async (values) => {
            setFormFeedback(null);
            await create.mutateAsync(values);
          }}
        />
      </section>
    </>
  );
}
