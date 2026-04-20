import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Calendar, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { DataTable } from "../components/common/DataTable";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Textarea } from "../components/ui/Textarea";

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

export function FacebookCampaignsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", postsPerDay: 5, startDate: "" });

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["fb-campaigns-list"],
    queryFn: async () => {
      const data = await apiGet<{ campaigns: Campaign[] }>("/facebook/campaigns");
      return data.campaigns;
    }
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) =>
      apiPost<{ campaign: Campaign }>("/facebook/campaigns", {
        name: payload.name,
        description: payload.description || undefined,
        postsPerDay: payload.postsPerDay,
        startDate: payload.startDate
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["fb-campaigns-list"] });
      setShowDialog(false);
      setForm({ name: "", description: "", postsPerDay: 5, startDate: "" });
      navigate(`/facebook/campaigns/${data.campaign.id}`);
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
      <PageHeader
        title="Đăng bài"
        subtitle="Trang này hiện đang quản lý batch/lô đăng Facebook theo số bài/ngày và ngày bắt đầu. Form nhập bài viết tay trong UI vẫn chưa hoàn thiện."
        actions={
          <Button onClick={() => setShowDialog(true)} icon={<Plus size={18} />}>
            Tạo lô đăng
          </Button>
        }
      />

      <SectionCard padded={false}>
        {isLoading ? (
          <div className="p-8 text-center text-muted">Đang tải...</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Chưa có lô đăng nào"
            description="Tạo lô đầu tiên để bắt đầu phân phối bài đăng Facebook."
            action={
              <Button onClick={() => setShowDialog(true)} variant="secondary">
                Tạo lô đăng đầu tiên
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={
              <>
                <th>Tên lô đăng</th>
                <th>Số bài</th>
                <th>Bài/ngày</th>
                <th>Ngày bắt đầu</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: "right" }}>Hành động</th>
              </>
            }
          >
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/facebook/campaigns/${c.id}`} className="font-semibold text-primary hover:underline">
                    {c.name}
                  </Link>
                  {c.description && <div className="text-xs text-muted mt-1">{c.description}</div>}
                </td>
                <td>{c._count?.posts ?? 0}</td>
                <td>{c.postsPerDay}</td>
                <td>{new Date(c.startDate).toLocaleDateString("vi-VN")}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    {c.status === "draft" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Calendar size={16} />}
                        disabled={scheduleMutation.isPending}
                        onClick={() => scheduleMutation.mutate(c.id)}
                      >
                        Lên lịch
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={16} />}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Xoá lô đăng "${c.name}"?`)) deleteMutation.mutate(c.id);
                      }}
                    >
                      Xoá
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </SectionCard>

      <Dialog open={showDialog} onClose={() => setShowDialog(false)} title="Tạo lô đăng mới">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(form);
          }}
          className="flex flex-col gap-4"
        >
          <div className="field">
            <Label htmlFor="name">Tên lô đăng *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VD: Batch Facebook tháng 5"
              required
            />
          </div>

          <div className="field">
            <Label htmlFor="description">Mô tả</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả ngắn gọn về lô đăng (tuỳ chọn)"
              rows={3}
            />
          </div>

          <div className="field">
            <Label htmlFor="postsPerDay">Số bài/ngày *</Label>
            <Input
              id="postsPerDay"
              type="number"
              min={1}
              max={20}
              value={form.postsPerDay}
              onChange={(e) => setForm((f) => ({ ...f, postsPerDay: Number(e.target.value) }))}
              required
            />
          </div>

          <div className="field">
            <Label htmlFor="startDate">Ngày bắt đầu *</Label>
            <Input
              id="startDate"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              required
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="ghost" onClick={() => setShowDialog(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={!form.name || !form.startDate || createMutation.isPending}>
              {createMutation.isPending ? "Đang tạo..." : "Tạo lô đăng"}
            </Button>
          </div>

          {createMutation.isError && (
            <p className="text-sm text-danger">{String(createMutation.error)}</p>
          )}
        </form>
      </Dialog>
    </>
  );
}
