import { cn } from "@irisdrone/lib/utils";

interface HudBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "success" | "warning" | "danger" | "info" | "secondary" | "default";
  size?: "sm" | "md";
}

const variantStyles: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25 shadow-[0_0_8px_rgba(16,185,129,0.12)]",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/25 shadow-[0_0_8px_rgba(245,158,11,0.12)]",
  danger: "bg-red-500/15 text-red-300 border-red-500/25 shadow-[0_0_8px_rgba(239,68,68,0.12)]",
  info: "bg-amber-500/15 text-amber-300 border-amber-500/25 shadow-[0_0_8px_rgba(245,158,11,0.12)]",
  secondary: "bg-zinc-500/12 text-zinc-400 border-zinc-500/20",
  default: "bg-amber-500/15 text-amber-300 border-amber-500/25 shadow-[0_0_8px_rgba(99,102,241,0.12)]",
};

const sizeStyles: Record<string, string> = {
  sm: "h-5 text-[10px] px-2.5 tracking-wide leading-none",
  md: "h-6 text-xs px-3 tracking-wide leading-none",
};

export function HudBadge({
  variant = "default",
  size = "sm",
  className,
  children,
  ...props
}: HudBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold rounded-full border transition-colors",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
