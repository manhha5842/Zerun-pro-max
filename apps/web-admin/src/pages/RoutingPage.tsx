import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../api/client";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";

export function RoutingPage() {
  const queryClient = useQueryClient();
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => apiGet<{ sources: Array<{ id: string; name: string }> }>("/sources") });
  const targets = useQuery({ queryKey: ["targets"], queryFn: () => apiGet<{ targets: Array<{ id: string; name: string }> }>("/targets") });
  const rules = useQuery({ queryKey: ["routing"], queryFn: () => apiGet<{ rules: Array<any> }>("/routing-rules") });
  const create = useMutation({
    mutationFn: (body: unknown) => apiPost("/routing-rules", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing"] })
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      sourceId: form.get("sourceId"),
      targetId: form.get("targetId"),
      autoPublish: form.get("autoPublish") === "on",
      useAI: form.get("useAI") === "on",
      requireReview: form.get("requireReview") === "on",
      isActive: true
    });
    event.currentTarget.reset();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Điều hướng</h1>
          <p className="page-subtitle">Gắn source với target để Worker Core quyết định chờ duyệt hay tự đăng.</p>
        </div>
      </header>
      <section className="split">
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Nguồn</th>
                <th>Đích</th>
                <th>Chế độ</th>
              </tr>
            </thead>
            <tbody>
              {(rules.data?.rules ?? []).map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.source?.name}</td>
                  <td>{rule.target?.name}</td>
                  <td>
                    <StatusBadge status={rule.autoPublish ? "active" : "paused"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="panel panel-pad" onSubmit={submit}>
          <h2>Thêm rule</h2>
          <div className="form-grid">
            <label className="field">
              <span>Nguồn</span>
              <select name="sourceId" required>
                {(sources.data?.sources ?? []).map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Đích đăng</span>
              <select name="targetId" required>
                {(targets.data?.targets ?? []).map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>
                <input type="checkbox" name="autoPublish" /> Tự đăng khi đủ điều kiện
              </span>
            </label>
            <label className="field">
              <span>
                <input type="checkbox" name="requireReview" defaultChecked /> Yêu cầu duyệt thủ công
              </span>
            </label>
            <label className="field">
              <span>
                <input type="checkbox" name="useAI" /> Dùng AI
              </span>
            </label>
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button>Tạo rule</Button>
          </div>
        </form>
      </section>
    </>
  );
}
