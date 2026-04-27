import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";

type Account = {
  id: string;
  kind: "source" | "target";
  name: string;
  platform: string;
  health: string;
  isActive: boolean;
  sessionState?: {
    authState?: string;
    lastCheckedAt?: string;
    authPath?: string;
  } | null;
};

export function AccountSessionsPage() {
  const query = useQuery({
    queryKey: ["accounts", "sessions"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/accounts")
  });
  const rows = (query.data?.accounts ?? []).filter((account) => account.kind === "target");

  return (
    <>
      <PageHeader
        title="Session / Health"
        subtitle="Tổng hợp trạng thái session, checkpoint và health của tài khoản đăng Facebook/Threads/Instagram."
      />
      <SectionCard>
        <AdminDataTable
          rows={rows}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có tài khoản đăng" description="Tạo tài khoản đăng ở trang Tài khoản đăng trước khi kiểm tra session." />}
          columns={[
            { key: "name", header: "Tài khoản", render: (row) => <div><strong>{row.name}</strong><div className="table-subtle">{row.platform}</div></div> },
            { key: "health", header: "Health", render: (row) => <StatusBadge status={row.health} /> },
            { key: "session", header: "Auth state", render: (row) => row.sessionState?.authState ? <StatusBadge status={row.sessionState.authState} /> : "Chưa kiểm tra" },
            { key: "checked", header: "Kiểm tra gần nhất", render: (row) => row.sessionState?.lastCheckedAt ? new Date(row.sessionState.lastCheckedAt).toLocaleString("vi-VN") : "-" },
            { key: "path", header: "Session path", render: (row) => row.sessionState?.authPath ?? "-" }
          ]}
        />
      </SectionCard>
    </>
  );
}
