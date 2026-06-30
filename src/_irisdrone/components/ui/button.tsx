import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@irisdrone/lib/utils"

/* Button uses tact-btn (theme-aware) plus a variant modifier class. SVG inherits currentColor. */
const buttonVariants = cva(
  "tact-btn inline-flex items-center justify-center gap-2 whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-current",
  {
    variants: {
      variant: {
        default: "",
        destructive: "tact-btn--danger",
        outline: "",
        secondary: "tact-btn--ghost",
        ghost: "tact-btn--ghost",
        link: "tact-btn--link",
        indigo: "tact-btn--primary",
      },
      size: {
        default: "h-9 px-4",
        sm: "tact-btn--sm",
        lg: "h-11 px-6 text-[12px]",
        icon: "tact-btn--icon",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
