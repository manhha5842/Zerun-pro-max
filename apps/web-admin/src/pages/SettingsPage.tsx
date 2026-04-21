import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";

export function SettingsPage() {
  const ai = useQuery({ queryKey: ["ai-configs"], queryFn: () => apiGet<{ configs: Array<any> }>("/ai/configs") });

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Quản lý cấu hình AI và một số thiết lập hệ thống hiện có." />
      <SectionCard title="Cấu hình AI" description="Các cấu hình đã lưu trong hệ thống.">
        <table className="table table-compact">
          <tbody>
            {(ai.data?.configs ?? []).map((config) => (
              <tr key={config.id}>
                <td>{config.provider}</td>
                <td>{config.name}</td>
                <td>{config.isActive ? "Đang bật" : "Đã tắt"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
