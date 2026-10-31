import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FrameBarProps = {
  path: readonly string[];
  meta?: ReactNode;
  className?: string;
};

export function FrameBar({ path, meta, className }: FrameBarProps) {
  return (
    <div
      className={cn(
        "flex h-11 items-center justify-between gap-3 border-b border-border-subtle px-4 @[640px]:px-5",
        className,
      )}
    >
      <p className="truncate font-mono text-[11.5px] text-faint">
        {path.map((part, index) => (
          <span key={part}>
            {index > 0 ? <span aria-hidden="true"> / </span> : null}
            <span
              className={
                index === path.length - 1 ? "text-muted-foreground" : undefined
              }
            >
              {part}
            </span>
          </span>
        ))}
      </p>
      {meta ? (
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-faint tabular-nums">
          {meta}
        </span>
      ) : null}
    </div>
  );
}
