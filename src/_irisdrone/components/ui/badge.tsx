import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@irisdrone/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 h-5 px-2.5 leading-none whitespace-nowrap font-semibold text-[9px] uppercase tracking-[0.13em] border transition-colors font-[Rajdhani,sans-serif]",
  {
    variants: {
      variant: {
        default:
          "bg-amber-500/[0.08] text-amber-200 border-amber-500/35 shadow-[0_0_8px_-2px_rgba(0,240,255,0.3)]",
        secondary:
          "bg-white/[0.04] text-zinc-300 border-white/[0.1]",
        destructive:
          "bg-red-500/[0.08] text-red-300 border-red-500/35 shadow-[0_0_8px_-2px_rgba(255,42,42,0.3)]",
        outline:
          "bg-transparent text-[#7d9fa6] border-[rgba(0,95,115,0.4)]",
        success:
          "bg-emerald-500/[0.08] text-emerald-300 border-emerald-500/35 shadow-[0_0_8px_-2px_rgba(16,185,129,0.3)]",
        warning:
          "bg-amber-500/[0.08] text-amber-300 border-amber-500/35 shadow-[0_0_8px_-2px_rgba(245,158,11,0.3)]",
        info:
          "bg-amber-500/[0.08] text-amber-200 border-amber-500/35 shadow-[0_0_8px_-2px_rgba(0,240,255,0.3)]",
        indigo:
          "bg-amber-500/[0.08] text-amber-200 border-amber-500/35 shadow-[0_0_8px_-2px_rgba(0,240,255,0.3)]",
        orange:
          "bg-orange-500/[0.08] text-orange-300 border-orange-500/35 shadow-[0_0_8px_-2px_rgba(249,115,22,0.3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
