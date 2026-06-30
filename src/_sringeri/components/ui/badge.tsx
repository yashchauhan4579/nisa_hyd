import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@sringeri/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap font-mono font-medium border backdrop-blur-sm rounded-full text-[10px] px-2 py-0.5 tracking-wider",
  {
    variants: {
      variant: {
        default:
          "bg-amber-500/15 text-amber-200 border-amber-400/35",
        secondary:
          "bg-zinc-500/15 text-zinc-200 border-zinc-400/30",
        destructive:
          "bg-rose-500/15 text-rose-200 border-rose-400/35",
        outline:
          "bg-zinc-500/10 text-zinc-300 border-zinc-400/30",
        success:
          "bg-emerald-500/15 text-emerald-200 border-emerald-400/35",
        warning:
          "bg-amber-500/15 text-amber-200 border-amber-400/35",
        info:
          "bg-amber-500/15 text-amber-200 border-amber-400/35",
        indigo:
          "bg-amber-500/15 text-amber-200 border-amber-400/35",
        orange:
          "bg-orange-500/15 text-orange-200 border-orange-400/35",
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
