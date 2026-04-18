import { cn } from "../../lib/utils";

const toneClass = {
  neutral: "border border-line bg-[var(--color-bg-muted)] text-foreground",
  good: "border bg-primarySoft text-primary",
  warn: "border bg-[var(--color-warning-bg)] text-warning",
  danger: "border bg-[var(--color-danger-bg)] text-danger"
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof toneClass }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold", toneClass[tone])}>{children}</span>;
}
