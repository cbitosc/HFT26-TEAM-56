import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ProductFrame({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "product-frame overflow-hidden rounded-xl bg-surface-1 text-[13px] leading-5 tracking-[-0.006em]",
        className,
      )}
      {...props}
    />
  );
}
