import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="rounded-lg border border-line bg-panel p-0 text-foreground shadow-soft backdrop:bg-black/50"
      onClose={onClose}
      style={{ maxWidth: "92vw", width: "680px" }}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <Button variant="ghost" onClick={onClose} className="h-8 w-8 p-0" title="Đóng">
          <X size={18} />
        </Button>
      </div>
      <div className="p-4 dialog-body">{children}</div>
    </dialog>
  );
}
