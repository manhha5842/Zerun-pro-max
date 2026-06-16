import { useState } from "react";
import { apiPost } from "../../api/client";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

type LocalFileResult = {
  filename: string;
  localPath: string;
  mimeType: string;
};

export function MediaPathInput({
  onAdd,
  placeholder = "Nhập đường dẫn file trên máy chủ..."
}: {
  onAdd: (file: LocalFileResult) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    const p = value.trim();
    if (!p) return;
    setError(null);
    setLoading(true);
    try {
      const data = await apiPost<{ file: LocalFileResult }>("/uploads/local-path", { path: p });
      onAdd(data.file);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể dùng đường dẫn này.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          style={{ flex: 1, fontSize: 13 }}
        />
        <Button type="button" variant="secondary" size="sm" onClick={() => void handleAdd()} disabled={!value.trim() || loading}>
          {loading ? "..." : "Thêm path"}
        </Button>
      </div>
      {error ? <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-danger)" }}>{error}</p> : null}
    </div>
  );
}
