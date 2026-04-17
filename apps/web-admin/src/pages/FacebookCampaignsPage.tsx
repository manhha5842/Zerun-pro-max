import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiPost, apiPut } from "../api/client";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

type Campaign = {
  id: string;
  name: string;
  description?: string;
  status: string;
  postsPerDay: number;
  startDate: string;
  createdAt: string;
  _count?: { posts: number };
};

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  draft: "neutral",
  active: "good",
  paused: "warn",
  completed: "good",
  cancelled: "bad"
};

export function FacebookCampaignsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", postsPerDay: "5", startDate: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["fb-campaigns"],
    queryFn: () => apiPost<{ campaigns: Campaign[] }>("/facebook/campaigns" as any)
  });

  // Actually GET, let me fix using apiGet
  const { data: campaigns, isLoading: loading } = useQuery({
    queryKey: ["fb-campaigns-list"],
    queryFn: async () => {
      const res = await fetch("/api/v1/facebook/campaigns", { credentials: "include" });
      const json = await res.json();
      return json.data?.campaigns as Campaign[];
    }
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) =>
      apiPost<{ campaign: Campaign }>("/facebook/campaigns", {
        name: payload.name,
        description: payload.description || undefined,
        postsPerDay: Number(payload.postsPerDay),
        startDate: payload.startDate
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-campaigns-list"] });
      setShowForm(false);
      setForm({ name: "", description: "", postsPerDay: "5", startDate: "" });
    }
  });

  const scheduleMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ scheduled: number }>(`/facebook/campaigns/${id}/schedule`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-campaigns-list"] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/facebook/campaigns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-campaigns-list"] })
  });

  const rows = campaigns ?? [];

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Facebook Campaigns</h1>
          <p className="page-subtitle">Lên lịch đăng thủ công theo chiến dịch cho Facebook (feed / story / reel).</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Huỷ" : "+ Tạo chiến dịch"}</Button>
      </header>

      {showForm && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: "0.75rem", fontWeight: 600 }}>Tạo chiến dịch mới</h2>
          <div style={{ display: "grid", gap: "0.75rem", maxWidth: 480 }}>
            <label>
              <span style={{ display: "block", marginBottom: 4, fontSize: "0.875rem" }}>Tên chiến dịch *</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Tháng 5 - Khuyến mãi"
              />
            </label>
            <label>
              <span style={{ display: "block", marginBottom: 4, fontSize: "0.875rem" }}>Mô tả</span>
              <input
                className="input"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Tuỳ chọn"
              />
            </label>
            <label>
              <span style={{ display: "block", marginBottom: 4, fontSize: "0.875rem" }}>Số bài/ngày *</span>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={form.postsPerDay}
                onChange={(e) => setForm((f) => ({ ...f, postsPerDay: e.target.value }))}
              />
            </label>
            <label>
              <span style={{ display: "block", marginBottom: 4, fontSize: "0.875rem" }}>Ngày bắt đầu *</span>
              <input
                className="input"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <Button
              disabled={!form.name || !form.startDate || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
            >
              {createMutation.isPending ? "Đang tạo..." : "Tạo chiến dịch"}
            </Button>
            {createMutation.isError && (
              <p style={{ color: "var(--color-bad)", fontSize: "0.875rem" }}>{String(createMutation.error)}</p>
            )}
          </div>
        </div>
      )}

      <div className="panel">
        {loading ? (
          <p style={{ color: "var(--color-muted)" }}>Đang tải...</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--color-muted)" }}>Chưa có chiến dịch nào. Tạo mới để bắt đầu.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Số bài</th>
                <th>Bài/ngày</th>
                <th>Ngày bắt đầu</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: "right" }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/facebook/campaigns/${c.id}`} style={{ fontWeight: 500 }}>
                      {c.name}
                    </Link>
                    {c.description && <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{c.description}</div>}
                  </td>
                  <td>{c._count?.posts ?? "—"}</td>
                  <td>{c.postsPerDay}</td>
                  <td>{new Date(c.startDate).toLocaleDateString("vi-VN")}</td>
                  <td>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
                  </td>
                  <td style={{ textAlign: "right", display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    {c.status === "draft" && (
                      <Button
                        variant="secondary"
                        disabled={scheduleMutation.isPending}
                        onClick={() => scheduleMutation.mutate(c.id)}
                      >
                        Lên lịch
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Xoá chiến dịch "${c.name}"?`)) deleteMutation.mutate(c.id);
                      }}
                    >
                      Xoá
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
