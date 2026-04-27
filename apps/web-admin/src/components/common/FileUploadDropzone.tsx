import type { ChangeEvent, ReactNode } from "react";
import { Upload } from "lucide-react";

export function FileUploadDropzone({
  label,
  description,
  accept,
  multiple,
  onChange
}: {
  label: string;
  description?: ReactNode;
  accept?: string;
  multiple?: boolean;
  onChange: (files: File[]) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(Array.from(event.target.files ?? []));
  }

  return (
    <label className="file-dropzone">
      <Upload size={18} aria-hidden />
      <span>{label}</span>
      {description ? <small>{description}</small> : null}
      <input type="file" accept={accept} multiple={multiple} onChange={handleChange} />
    </label>
  );
}
