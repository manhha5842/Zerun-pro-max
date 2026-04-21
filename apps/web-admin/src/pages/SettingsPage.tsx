import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";

export function SettingsPage() {
  const ai = useQuery({ queryKey: ["ai-configs"], queryFn: () => apiGet<{ configs: Array<any> }>("/ai/configs") });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Cài đặt</h1>
          <p className="page-subtitle">AI provider và cấu hình hệ thống. Adapter AI thật sẽ được nối sau khi có provider/key.</p>
        </div>
      </header>
      <div className="panel panel-pad">
        <h2>AI configs</h2>
        <table className="table">
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
      </div>
    </>
  );
}
