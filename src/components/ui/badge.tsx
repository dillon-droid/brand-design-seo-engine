import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[hsl(36_95%_57%/0.15)] text-[hsl(36_95%_57%)] border-[hsl(36_95%_57%/0.3)]",
        secondary: "bg-secondary text-secondary-foreground border-border",
        outline: "text-foreground border-border",
        success: "bg-green-500/10 text-green-400 border-green-500/20",
        warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
        purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
