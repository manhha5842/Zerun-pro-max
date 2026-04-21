import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { DataTable } from "../components/common/DataTable";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";

export function SchedulesPage() {
  const query = useQuery({ queryKey: ["schedules"], queryFn: () => apiGet<{ schedules: Array<any> }>("/schedules") });

  return (
    <>
      <PageHeader title="Lịch đăng" subtitle="Danh sách bài đã lên lịch và trạng thái xử lý hiện tại." />

      <SectionCard title="Danh sách lịch đăng" description="Mỗi dòng là một lần đăng đã được xếp lịch cho một tài khoản.">
        <DataTable
          className="table-compact"
          columns={
            <>
              <th>Mã bài</th>
              <th>Tài khoản</th>
              <th>Thời gian đăng</th>
              <th>Trạng thái</th>
            </>
          }
          empty={
            query.data && query.data.schedules.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState title="Chưa có lịch đăng" description="Khi anh lên lịch cho bài viết, dữ liệu sẽ hiện ở đây." />
                </td>
              </tr>
            ) : null
          }
        >
          {(query.data?.schedules ?? []).map((schedule) => (
            <tr key={schedule.id}>
              <td>
                <strong>{schedule.content?.code ?? "-"}</strong>
              </td>
              <td>{schedule.target?.name ?? <span className="table-subtle">Chưa có</span>}</td>
              <td>{new Date(schedule.scheduledAt).toLocaleString("vi-VN")}</td>
              <td>
                <StatusBadge status={schedule.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>
    </>
  );
}
