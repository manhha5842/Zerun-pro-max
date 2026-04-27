import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";

type WorkerJob = {
  id: string;
  queueName: string;
  jobName: string;
  jobId?: string | null;
  status: string;
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

export function WorkerJobsPage() {
  const [queueName, setQueueName] = useState("all");
  const [status, setStatus] = useState("all");
  const query = useQuery({
    queryKey: ["worker-jobs", queueName, status],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (queueName !== "all") params.set("queueName", queueName);
      if (status !== "all") params.set("status", status);
      return apiGet<{ jobs: WorkerJob[] }>(`/worker-jobs?${params.toString()}`);
    }
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/worker-jobs/${id}/retry-log`, {}),
    onSuccess: () => query.refetch()
  });

  return (
    <>
      <PageHeader
        title="Worker jobs / Logs"
        subtitle="Theo dõi queue auto conversion, crawl, media ingest, publish và retry log khi cần."
        actions={<Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()}>Làm mới</Button>}
      />
      <SectionCard>
        <FilterToolbar>
          <Select value={queueName} onChange={(event) => setQueueName(event.target.value)}>
            <option value="all">Tất cả queue</option>
            <option value="auto-conversion">Auto conversion</option>
            <option value="crawl">Crawl</option>
            <option value="publish">Publish</option>
            <option value="comment">Comment</option>
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </Select>
        </FilterToolbar>
        <AdminDataTable
          rows={query.data?.jobs ?? []}
          getRowKey={(row) => row.id}
          empty={<EmptyState title="Chưa có worker log" description="Các job mới sẽ được ghi lại khi auto conversion, crawl hoặc publish chạy." />}
          columns={[
            { key: "time", header: "Thời gian", render: (row) => new Date(row.createdAt).toLocaleString("vi-VN") },
            { key: "queue", header: "Queue", render: (row) => row.queueName },
            { key: "job", header: "Job", render: (row) => <div>{row.jobName}<div className="table-subtle">{row.jobId ?? "-"}</div></div> },
            { key: "status", header: "Trạng thái", render: (row) => <StatusBadge status={row.status} /> },
            { key: "error", header: "Lỗi", render: (row) => row.error ?? "-" },
            { key: "actions", header: "Thao tác", render: (row) => <Button size="sm" variant="secondary" onClick={() => retryMutation.mutate(row.id)}>Retry log</Button> }
          ]}
        />
      </SectionCard>
    </>
  );
}
