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
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        size === "default" && "h-10 px-4",
        size === "sm" && "h-8 px-3 text-xs",
        size === "icon" && "h-9 w-9 p-0",
        variant === "primary" && "bg-primary text-white hover:bg-[#0b5c4c]",
        variant === "secondary" && "bg-primarySoft text-primary hover:bg-[#cbeadf]",
        variant === "ghost" && "bg-transparent text-foreground hover:bg-line",
        variant === "danger" && "bg-danger text-white hover:bg-[#8f1c14]",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
