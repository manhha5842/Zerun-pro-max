import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { StatusBadge } from "../components/common/StatusBadge";

export function SchedulesPage() {
  const query = useQuery({ queryKey: ["schedules"], queryFn: () => apiGet<{ schedules: Array<any> }>("/schedules") });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Lịch đăng</h1>
          <p className="page-subtitle">Các job hẹn giờ sẽ được Worker Core đánh thức qua BullMQ delayed jobs.</p>
        </div>
      </header>
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Nội dung</th>
              <th>Đích</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
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
          </tbody>
        </table>
      </div>
    </>
  );
}
