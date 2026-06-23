import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link2, Wand2 } from "lucide-react";
import { apiPost } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { SetupGuide } from "../components/common/SetupGuide";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Label } from "../components/ui/Label";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";

type DetectedLink = {
  url: string;
  network: string;
  supported: boolean;
};

type ConvertedResult = {
  original?: string;
  originalUrl?: string;
  url?: string;
  converted?: string;
  convertedUrl?: string;
  success?: boolean;
  error?: string;
};

export function QuickConvertLinkPage() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [links, setLinks] = useState<DetectedLink[]>([]);
  const [results, setResults] = useState<ConvertedResult[]>([]);

  const detect = useMutation({
    mutationFn: () => apiPost<{ links: DetectedLink[] }>("/links/detect", { text }),
    onSuccess: (data) => {
      setLinks(data.links);
      setResults([]);
      toast.success(`Đã phát hiện ${data.links.length} link.`);
    },
    onError: (error) => toast.error(error.message)
  });

  const convert = useMutation({
    mutationFn: () => apiPost<{ results: ConvertedResult[] }>("/links/convert", { urls: links.filter((link) => link.supported).map((link) => link.url) }),
    onSuccess: (data) => {
      setResults(data.results);
      toast.success("Đã convert các link được hỗ trợ.");
    },
    onError: (error) => toast.error(error.message)
  });

  const outputText = useMemo(() => {
    let output = text;
    for (const result of results) {
      const originalUrl = result.originalUrl ?? result.original ?? result.url;
      const convertedUrl = result.convertedUrl ?? result.converted;
      if (originalUrl && convertedUrl) output = output.split(originalUrl).join(convertedUrl);
    }
    return output;
  }, [results, text]);

  return (
    <div className="page-stack">
      <PageHeader title="Convert link nhanh" subtitle="Dùng để xử lý lẻ một caption/link. Không phải công cụ convert hàng loạt." />
      <SectionCard title="Hướng dẫn nhanh">
        <SetupGuide
          steps={[
            { title: "Dán caption hoặc link", description: "Có thể dán tiếng Việt có dấu và nhiều link trong cùng một đoạn." },
            { title: "Phát hiện link", description: "Hệ thống nhận diện network như Shopee/Lazada và đánh dấu link có hỗ trợ convert." },
            { title: "Convert", description: "Chỉ link được hỗ trợ mới gửi qua affiliate adapter; link khác nên xử lý ở trang Link lỗi cần xử lý." }
          ]}
        />
      </SectionCard>
      <SectionCard title="Nhập nội dung">
        <div className="form-grid">
          <label className="span-2">
            <Label>Caption/link cần convert</Label>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className="span-2 actions">
            <Button icon={<Link2 aria-hidden />} onClick={() => detect.mutate()} disabled={detect.isPending || !text.trim()}>Phát hiện link</Button>
            <Button variant="secondary" icon={<Wand2 aria-hidden />} onClick={() => convert.mutate()} disabled={convert.isPending || links.filter((link) => link.supported).length === 0}>Convert link hỗ trợ</Button>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Link phát hiện">
        <AdminDataTable
          rows={links}
          getRowKey={(row) => row.url}
          empty={<EmptyState title="Chưa phát hiện link" description="Bấm Phát hiện link để xem danh sách." />}
          columns={[
            { key: "url", header: "URL", render: (row) => <code className="code-inline">{row.url}</code> },
            { key: "network", header: "Network", render: (row) => <Badge tone="neutral">{row.network}</Badge> },
            { key: "supported", header: "Hỗ trợ", render: (row) => <Badge tone={row.supported ? "good" : "warn"}>{row.supported ? "Có" : "Chưa"}</Badge> }
          ]}
        />
      </SectionCard>
      <SectionCard title="Kết quả">
        <Textarea readOnly value={outputText} />
      </SectionCard>
    </div>
  );
}
