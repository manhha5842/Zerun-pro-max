import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold transition-colors", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-[var(--color-on-primary)]",
      secondary: "border-line bg-[var(--color-bg-muted)] text-foreground",
      outline: "border-line text-foreground",
      destructive: "border-transparent bg-danger text-[var(--color-on-danger)]",
      good: "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]",
      warn: "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-warning",
      danger: "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-danger",
      neutral: "border-line bg-[var(--color-bg-muted)] text-foreground"
    }
  },
  defaultVariants: {
    variant: "secondary"
  }
});

export function Badge({
  className,
  variant,
  tone,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants> & { tone?: "neutral" | "good" | "warn" | "danger" }) {
  return <div className={cn(badgeVariants({ variant: variant ?? tone, className }))} {...props} />;
}

export { badgeVariants };
