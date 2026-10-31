import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "accent" | "neutral" | "muted" | "danger";

const DOT: Record<StatusTone, string> = {
  accent: "bg-primary",
  neutral: "bg-foreground/60",
  muted: "bg-foreground/25",
  danger: "bg-destructive",
};

/** A small dot and a label: the one status pattern used across the app. */
export function StatusIndicator({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
        tone === "danger" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
