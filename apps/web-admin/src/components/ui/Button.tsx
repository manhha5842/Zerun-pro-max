import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm" | "icon";
  icon?: ReactNode;
};

export function Button({ className, variant = "primary", size = "default", icon, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors transition-shadow disabled:cursor-not-allowed disabled:opacity-60",
        size === "default" && "h-10 px-4",
        size === "sm" && "h-8 px-3 text-[12px]",
        size === "icon" && "h-9 w-9 p-0",
        variant === "primary" && "border-primary bg-primary text-white hover:bg-[var(--color-primary-hover)] hover:border-[var(--color-primary-hover)]",
        variant === "secondary" && "border-primarySoft bg-primarySoft text-primary hover:bg-[#cbeadf]",
        variant === "ghost" && "border-transparent bg-transparent text-foreground hover:bg-[var(--color-bg-muted)]",
        variant === "danger" && "border-danger bg-danger text-white hover:bg-[#8f1c14] hover:border-[#8f1c14]",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
