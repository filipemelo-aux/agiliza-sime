import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[10px] border border-border/60 bg-muted/20 px-3.5 py-3 text-sm placeholder:text-muted-foreground/50 hover:border-border focus:outline-none focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-0 focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-150 ease-out",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
