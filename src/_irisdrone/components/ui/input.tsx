import * as React from "react"
import { cn } from "@irisdrone/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Tactical input — uses tact-input class which gets theme-aware overrides
 * via :root.light in tactical.css. Never use hardcoded bg/color here.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn("tact-input", className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
