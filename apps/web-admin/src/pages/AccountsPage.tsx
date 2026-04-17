import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";

export function AccountsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["accounts"], queryFn: () => apiGet<{ accounts: Array<any> }>("/accounts") });
  const test = useMutation({
    mutationFn: (account: any) => apiPost(`/accounts/${account.id}/test`, { kind: account.kind }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] })
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Tài khoản nền tảng</h1>
          <p className="page-subtitle">Kiểm tra credential/session thật và tự động cập nhật trạng thái health.</p>
        </div>
      </header>
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Loại</th>
              <th>Nền tảng</th>
              <th>Sức khỏe</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.accounts ?? []).map((account) => (
              <tr key={`${account.kind}-${account.id}`}>
                <td>{account.name}</td>
                <td>{account.kind === "source" ? "Nguồn" : "Đích"}</td>
                <td>{account.platform}</td>
                <td>
                  <StatusBadge status={account.health} />
                </td>
                <td>
                  <Button variant="secondary" icon={<ShieldCheck aria-hidden />} onClick={() => test.mutate(account)}>
                    Test
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
