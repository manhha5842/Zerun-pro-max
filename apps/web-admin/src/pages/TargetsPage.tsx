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
  const query = useQuery({ queryKey: ["targets"], queryFn: () => apiGet<{ targets: Target[] }>("/targets") });
  const create = useMutation({
    mutationFn: (values: AccountFormValues) => apiPost("/targets", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["targets"] })
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Đích đăng</h1>
          <p className="page-subtitle">Mỗi target là một tài khoản, channel, profile hoặc group dùng để publish thật.</p>
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
              </tr>
            </thead>
            <tbody>
              {(query.data?.targets ?? []).map((target) => (
                <tr key={target.id}>
                  <td>{target.name}</td>
                  <td>{target.platform}</td>
                  <td>
                    <StatusBadge status={target.health} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AccountForm label="Thêm đích đăng thật" onSubmit={(values) => create.mutate(values)} />
      </section>
    </>
  );
}
