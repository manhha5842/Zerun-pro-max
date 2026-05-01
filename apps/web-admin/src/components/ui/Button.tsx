import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]",
        primary: "border-primary bg-primary text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]",
        secondary: "border-primarySoft bg-primarySoft text-primary hover:brightness-95 dark:hover:brightness-110",
        outline: "border-line bg-panel text-foreground hover:bg-[var(--color-bg-muted)]",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-[var(--color-bg-muted)]",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
        destructive: "border-danger bg-danger text-[var(--color-on-danger)] hover:brightness-90 dark:hover:brightness-110",
        danger: "border-danger bg-danger text-[var(--color-on-danger)] hover:brightness-90 dark:hover:brightness-110"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-8",
        icon: "size-9 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    icon?: ReactNode;
  };

export function Button({ className, variant, size, asChild = false, icon, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props}>
      {icon}
      {children}
    </Comp>
  );
}

export { buttonVariants };
