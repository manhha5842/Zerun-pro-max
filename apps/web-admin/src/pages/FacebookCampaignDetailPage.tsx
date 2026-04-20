import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Upload, Calendar, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { useState } from "react";
import { Dialog } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Textarea } from "../components/ui/Textarea";
import { Select } from "../components/ui/Select";

type CampaignDetail = {
  campaign: {
    id: string;
    name: string;
    description?: string;
    status: string;
    postsPerDay: number;
    startDate: string;
    posts: Array<{
      id: string;
      type: string;
      caption?: string;
      status: string;
      scheduledAt?: string;
      media: Array<{ id: string; localPath: string; mimeType: string }>;
      targets: Array<{
        id: string;
        status: string;
        scheduledAt?: string;
        targetAccount: { id: string; name: string };
      }>;
      comments: Array<{ id: string; text: string; delayMinutes: number }>;
      executions: Array<{ id: string; status: string; resultUrl?: string; error?: string }>;
    }>;
  };
};

export function FacebookCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showAddPost, setShowAddPost] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["fb-campaign", id],
    queryFn: () => apiGet<CampaignDetail>(`/facebook/campaigns/${id}`),
    enabled: Boolean(id)
  });

  const scheduleMutation = useMutation({
    mutationFn: () => apiPost(`/facebook/campaigns/${id}/schedule`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-campaign", id] });
      qc.invalidateQueries({ queryKey: ["fb-campaigns-list"] });
    }
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId: string) => apiDelete(`/facebook/posts/${postId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-campaign", id] })
  });

  const campaign = data?.campaign;

  if (isLoading) {
    return <div className="p-8 text-center text-muted">Đang tải...</div>;
  }

  if (!campaign) {
    return <div className="p-8 text-center text-muted">Không tìm thấy luồng đăng bài.</div>;
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link to="/facebook/campaigns" className="text-sm text-primary hover:underline flex items-center gap-2 mb-2">
            <ArrowLeft size={16} />
            Quay lại luồng đăng bài
          </Link>
          <h1 className="page-title">{campaign.name}</h1>
          {campaign.description && <p className="page-subtitle">{campaign.description}</p>}
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={campaign.status} />
            <span className="text-sm text-muted">
              {campaign.posts.length} bài • {campaign.postsPerDay} bài/ngày • Bắt đầu{" "}
              {new Date(campaign.startDate).toLocaleDateString("vi-VN")}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === "draft" && (
            <Button
              icon={<Calendar size={18} />}
              onClick={() => scheduleMutation.mutate()}
              disabled={scheduleMutation.isPending || campaign.posts.length === 0}
            >
              Lên lịch tất cả
            </Button>
          )}
          <Button variant="secondary" icon={<Upload size={18} />} onClick={() => setShowImport(true)}>
            Import Excel
          </Button>
        </div>
      </header>

      <div className="panel">
        <div className="flex items-center justify-between p-4 border-b border-line">
          <h2 className="text-lg font-semibold">Danh sách bài đăng ({campaign.posts.length})</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowAddPost(true)}>
            + Thêm bài
          </Button>
        </div>

        {campaign.posts.length === 0 ? (
          <div className="p-8 text-center text-muted">
            <p>Chưa có bài đăng nào.</p>
            <div className="flex gap-2 justify-center mt-4">
              <Button variant="secondary" onClick={() => setShowAddPost(true)}>
                Thêm bài thủ công
              </Button>
              <Button variant="secondary" onClick={() => setShowImport(true)}>
                Import từ Excel
              </Button>
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Loại</th>
                <th>Nội dung</th>
                <th>Media</th>
                <th>Targets</th>
                <th>Trạng thái</th>
                <th>Lịch đăng</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaign.posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    <span className="text-xs font-semibold uppercase">{post.type}</span>
                  </td>
                  <td>
                    <div className="max-w-md">
                      {post.caption ? (
                        <p className="text-sm line-clamp-2">{post.caption}</p>
                      ) : (
                        <span className="text-xs text-muted italic">Không có caption</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="text-sm">{post.media.length} file</span>
                  </td>
                  <td>
                    <span className="text-sm">{post.targets.length} tài khoản</span>
                  </td>
                  <td>
                    <StatusBadge status={post.status} />
                  </td>
                  <td>
                    {post.scheduledAt ? (
                      <span className="text-sm">{new Date(post.scheduledAt).toLocaleString("vi-VN")}</span>
                    ) : (
                      <span className="text-xs text-muted">Chưa lên lịch</span>
                    )}
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => {
                        if (confirm("Xoá bài này?")) deletePostMutation.mutate(post.id);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showImport} onClose={() => setShowImport(false)} title="Import bài đăng từ Excel">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Tính năng import Excel đang được phát triển. Hiện tại vui lòng thêm bài thủ công hoặc sử dụng API endpoint{" "}
            <code className="bg-line px-1 py-0.5 rounded text-xs">POST /facebook/campaigns/{id}/import</code>
          </p>
          <div className="field">
            <Label>File Excel (.xlsx)</Label>
            <Input type="file" accept=".xlsx,.xls" />
          </div>
          <p className="text-xs text-muted">
            Format: Mỗi dòng chứa caption, media paths (phân cách bằng dấu |), và comments (tuỳ chọn).
          </p>
          <Button variant="secondary" disabled>
            Upload & Import
          </Button>
        </div>
      </Dialog>

      <Dialog open={showAddPost} onClose={() => setShowAddPost(false)} title="Thêm bài đăng">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Tính năng thêm bài thủ công qua UI đang được phát triển. Hiện tại vui lòng sử dụng API endpoint{" "}
            <code className="bg-line px-1 py-0.5 rounded text-xs">POST /facebook/posts</code>
          </p>
          <div className="field">
            <Label>Loại bài đăng</Label>
            <Select>
              <option value="feed">Feed</option>
              <option value="story">Story</option>
              <option value="reel">Reel</option>
            </Select>
          </div>
          <div className="field">
            <Label>Caption</Label>
            <Textarea placeholder="Nội dung bài đăng..." rows={4} />
          </div>
          <Button variant="secondary" disabled>
            Thêm bài
          </Button>
        </div>
      </Dialog>
    </>
  );
}
