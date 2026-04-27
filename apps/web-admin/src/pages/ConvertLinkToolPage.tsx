import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost, apiPostForm } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { FileUploadDropzone } from "../components/common/FileUploadDropzone";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";

type DetectedLink = {
  originalUrl: string;
  network: string;
  action: string;
  reason?: string;
};

type ConvertResult = {
  originalUrl: string;
  convertedUrl?: string;
  failureReason?: string;
};

export function ConvertLinkToolPage() {
  const [step, setStep] = useState(1);
  const [text, setText] = useState("");
  const [subIds, setSubIds] = useState(["", "", "", "", ""]);
  const [batchId, setBatchId] = useState("");
  const [links, setLinks] = useState<DetectedLink[]>([]);
  const [batchFile, setBatchFile] = useState<{ fileUrl: string; filename: string } | null>(null);
  const [results, setResults] = useState<ConvertResult[]>([]);
  const [outputMode, setOutputMode] = useState<"text" | "xlsx">("text");
  const [finalOutput, setFinalOutput] = useState<{ text?: string; fileUrl?: string; filename?: string } | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);

  const detectMutation = useMutation({
    mutationFn: async () => {
      if (sourceFile) {
        const body = new FormData();
        body.append("file", sourceFile);
        body.append("text", text);
        body.append("subIds", JSON.stringify(subIds));
        return apiPostForm<{ links: DetectedLink[]; batchId: string }>("/tools/convert-link/detect", body);
      }
      return apiPost<{ links: DetectedLink[]; batchId: string }>("/tools/convert-link/detect", { text, subIds });
    },
    onSuccess: (data) => {
      setLinks(data.links);
      setBatchId(data.batchId);
      setStep(2);
    }
  });

  const exportMutation = useMutation({
    mutationFn: () => apiPost<{ fileUrl: string; filename: string }>("/tools/convert-link/export-batch", { batchId }),
    onSuccess: (data) => setBatchFile(data)
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (resultFile) {
        const body = new FormData();
        body.append("batchId", batchId);
        body.append("file", resultFile);
        return apiPostForm<{ results: ConvertResult[] }>("/tools/convert-link/import-result", body);
      }
      return apiPost<{ results: ConvertResult[] }>("/tools/convert-link/import-result", { batchId, csvText: "" });
    },
    onSuccess: (data) => {
      setResults(data.results);
      setStep(3);
    }
  });

  const applyMutation = useMutation({
    mutationFn: () => apiPost<{ text?: string; fileUrl?: string; filename?: string }>("/tools/convert-link/apply-result", { batchId, output: outputMode }),
    onSuccess: (data) => setFinalOutput(data)
  });

  return (
    <>
      <PageHeader
        title="Convert link affiliate"
        subtitle="Workflow thủ công: phát hiện link, xuất Batch Custom Links.xlsx, nhập CSV kết quả rồi thay link trong nội dung hoặc Excel."
      />

      <div className="stepper">
        {["Tạo file convert", "Nhập kết quả convert", "Xuất kết quả"].map((label, index) => (
          <button key={label} type="button" className={step === index + 1 ? "active" : ""} onClick={() => setStep(index + 1)}>
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 1 ? (
        <SectionCard title="1. Tạo file convert">
          <div className="form-grid">
            <label className="span-2">
              <Label>Nội dung cần detect link</Label>
              <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Dán nội dung tiếng Việt có link Shopee/Lazada hoặc link cần kiểm tra..." />
            </label>
            <div className="span-2">
              <FileUploadDropzone label="Hoặc upload Excel/CSV" accept=".xlsx,.xls,.csv,.txt" onChange={(files) => setSourceFile(files[0] ?? null)} />
              {sourceFile ? <p className="table-subtle">Đã chọn: {sourceFile.name}</p> : null}
            </div>
            {subIds.map((subId, index) => (
              <label key={index}>
                <Label>{`Sub_id${index + 1}`}</Label>
                <Input value={subId} onChange={(event) => setSubIds((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
              </label>
            ))}
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <Button onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending || (!text.trim() && !sourceFile)}>Detect links</Button>
          </div>
        </SectionCard>
      ) : null}

      {links.length > 0 ? (
        <SectionCard title="Link đã phát hiện" actions={<Button variant="secondary" onClick={() => exportMutation.mutate()} disabled={!batchId}>Download Batch Custom Links.xlsx</Button>}>
          {batchFile ? <p><a href={batchFile.fileUrl}>{batchFile.filename}</a></p> : null}
          <AdminDataTable
            rows={links}
            getRowKey={(row) => row.originalUrl}
            columns={[
              { key: "url", header: "Liên kết gốc", render: (row) => row.originalUrl },
              { key: "network", header: "Network", render: (row) => row.network },
              { key: "action", header: "Action", render: (row) => row.action },
              { key: "reason", header: "Ghi chú", render: (row) => row.reason ?? "Có thể convert" }
            ]}
          />
        </SectionCard>
      ) : null}

      {step === 2 ? (
        <SectionCard title="2. Nhập CSV kết quả convert">
          <FileUploadDropzone label="Upload AffiliateBatchCustomLinks CSV" accept=".csv,.xlsx,.xls" onChange={(files) => setResultFile(files[0] ?? null)} />
          {resultFile ? <p className="table-subtle">Đã chọn: {resultFile.name}</p> : null}
          <div className="actions" style={{ marginTop: 16 }}>
            <Button onClick={() => importMutation.mutate()} disabled={!batchId || !resultFile || importMutation.isPending}>Parse kết quả</Button>
          </div>
        </SectionCard>
      ) : null}

      {results.length > 0 ? (
        <SectionCard title="Preview kết quả convert">
          <AdminDataTable
            rows={results}
            getRowKey={(row) => row.originalUrl}
            columns={[
              { key: "original", header: "Liên kết gốc", render: (row) => row.originalUrl },
              { key: "converted", header: "Liên kết chuyển đổi", render: (row) => row.convertedUrl ?? "-" },
              { key: "reason", header: "Lí do thất bại", render: (row) => row.failureReason ?? "-" }
            ]}
          />
        </SectionCard>
      ) : null}

      {step === 3 ? (
        <SectionCard title="3. Xuất kết quả cuối">
          <div className="form-grid">
            <label>
              <Label>Định dạng output</Label>
              <Select value={outputMode} onChange={(event) => setOutputMode(event.target.value as "text" | "xlsx")}>
                <option value="text">Text</option>
                <option value="xlsx">Excel</option>
              </Select>
            </label>
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <Button onClick={() => applyMutation.mutate()} disabled={!batchId || applyMutation.isPending}>Thay link và xuất kết quả</Button>
          </div>
          {finalOutput?.text ? <Textarea readOnly value={finalOutput.text} style={{ marginTop: 16 }} /> : null}
          {finalOutput?.fileUrl ? <p><a href={finalOutput.fileUrl}>{finalOutput.filename}</a></p> : null}
        </SectionCard>
      ) : null}
    </>
  );
}
