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
      <PageHeader title="Lịch đăng" subtitle="Các job hẹn giờ sẽ được Worker Core đánh thức qua BullMQ delayed jobs." />
      <SectionCard padded={false}>
        <DataTable
          columns={
            <>
              <th>Nội dung</th>
              <th>Đích</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
            </>
          }
          empty={
            query.data && query.data.schedules.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState title="Chưa có lịch đăng" description="Các lịch hẹn đăng sẽ xuất hiện tại đây." />
                </td>
              </tr>
            ) : null
          }
        >
          {(query.data?.schedules ?? []).map((schedule) => (
            <tr key={schedule.id}>
              <td>{schedule.content?.code}</td>
              <td>{schedule.target?.name}</td>
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
