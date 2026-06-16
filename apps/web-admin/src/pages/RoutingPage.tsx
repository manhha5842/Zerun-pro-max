import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/common/PageHeader";

type RoutingRule = {
  id: string;
  sourceId: string;
  targetId: string;
  isActive: boolean;
  autoPublish: boolean;
  useAI: boolean;
  requireReview: boolean;
  source?: { name: string };
  target?: { name: string };
};

export function RoutingPage() {
  const queryClient = useQueryClient();
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => apiGet<{ sources: Array<{ id: string; name: string }> }>("/sources") });
  const targets = useQuery({ queryKey: ["targets"], queryFn: () => apiGet<{ targets: Array<{ id: string; name: string }> }>("/targets") });
  const rules = useQuery({ queryKey: ["routing"], queryFn: () => apiGet<{ rules: RoutingRule[] }>("/routing-rules") });

  const create = useMutation({
    mutationFn: (body: unknown) => apiPost("/routing-rules", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing"] })
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/routing-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing"] })
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPut(`/routing-rules/${id}`, { isActive }),
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
      <PageHeader
        title="Điều hướng"
        subtitle="Gắn source với target — Worker Core quyết định chờ duyệt hay tự đăng."
      />
      <section className="split">
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Nguồn</th>
                <th>Đích</th>
                <th>Tự đăng</th>
                <th>Dùng AI</th>
                <th>Cần duyệt</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(rules.data?.rules ?? []).map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.source?.name ?? rule.sourceId.slice(0, 8)}</td>
                  <td>{rule.target?.name ?? rule.targetId.slice(0, 8)}</td>
                  <td><Badge tone={rule.autoPublish ? "good" : "neutral"}>{rule.autoPublish ? "Có" : "Không"}</Badge></td>
                  <td><Badge tone={rule.useAI ? "good" : "neutral"}>{rule.useAI ? "Có" : "Không"}</Badge></td>
                  <td><Badge tone={rule.requireReview ? "warn" : "neutral"}>{rule.requireReview ? "Có" : "Không"}</Badge></td>
                  <td>
                    <Badge tone={rule.isActive ? "good" : "neutral"}>{rule.isActive ? "Bật" : "Tắt"}</Badge>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggle.mutate({ id: rule.id, isActive: !rule.isActive })}
                    >
                      {rule.isActive ? "Tắt" : "Bật"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => { if (confirm("Xóa rule này?")) remove.mutate(rule.id); }}
                    >
                      Xóa
                    </Button>
                  </td>
                </tr>
              ))}
              {(rules.data?.rules ?? []).length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--color-text-muted)", padding: 16 }}>Chưa có rule nào.</td></tr>
              )}
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
                  <option key={source.id} value={source.id}>{source.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Đích đăng</span>
              <select name="targetId" required>
                {(targets.data?.targets ?? []).map((target) => (
                  <option key={target.id} value={target.id}>{target.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span><input type="checkbox" name="autoPublish" /> Tự đăng khi đủ điều kiện</span>
            </label>
            <label className="field">
              <span><input type="checkbox" name="useAI" /> Dùng AI để phân tích</span>
            </label>
            <label className="field">
              <span><input type="checkbox" name="requireReview" defaultChecked /> Yêu cầu duyệt thủ công</span>
            </label>
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button disabled={create.isPending}>Tạo rule</Button>
          </div>
        </form>
      </section>
    </>
  );
}
