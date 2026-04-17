import { cn } from "../../lib/utils";

const toneClass = {
  neutral: "bg-line text-foreground",
  good: "bg-primarySoft text-primary",
  warn: "bg-[#fff2cc] text-warning",
  danger: "bg-[#ffe1dc] text-danger"
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof toneClass }) {
  return <span className={cn("inline-flex items-center rounded px-2 py-1 text-xs font-semibold", toneClass[tone])}>{children}</span>;
}
