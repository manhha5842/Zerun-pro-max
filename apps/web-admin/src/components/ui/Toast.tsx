import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button } from "./Button";

type ToastTone = "success" | "error" | "info" | "warning";

type ToastInput = {
  tone?: ToastTone;
  title?: string;
  message: string;
  duration?: number;
};

type ToastItem = Required<Pick<ToastInput, "tone" | "message">> &
  Pick<ToastInput, "title"> & {
    id: string;
  };

type ToastContextValue = {
  show: (toast: ToastInput) => string;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 aria-hidden size={18} />,
  error: <XCircle aria-hidden size={18} />,
  info: <Info aria-hidden size={18} />,
  warning: <AlertCircle aria-hidden size={18} />
};

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = createToastId();
    const duration = toast.duration ?? 4200;
    const nextToast: ToastItem = {
      id,
      tone: toast.tone ?? "info",
      title: toast.title,
      message: toast.message
    };

    setToasts((current) => [nextToast, ...current].slice(0, 5));
    if (duration > 0) {
      window.setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({
    show,
    success: (message, title) => show({ tone: "success", message, title }),
    error: (message, title) => show({ tone: "error", message, title, duration: 7000 }),
    info: (message, title) => show({ tone: "info", message, title }),
    warning: (message, title) => show({ tone: "warning", message, title, duration: 6000 }),
    dismiss
  }), [dismiss, show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
            <div className="toast-icon">{icons[toast.tone]}</div>
            <div className="toast-content">
              {toast.title ? <strong>{toast.title}</strong> : null}
              <span>{toast.message}</span>
            </div>
            <Button type="button" variant="ghost" size="icon" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Đóng thông báo">
              <X aria-hidden size={14} />
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
}
