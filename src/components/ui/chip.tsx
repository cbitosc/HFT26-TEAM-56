import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Compact label for a skill or technology. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border border-border bg-surface-1 px-2 text-xs leading-none text-foreground/85",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ChipList({ items, label, className }: { items: string[]; label?: string; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label={label}>
      {items.map((item) => (
        <li key={item}>
          <Chip>{item}</Chip>
        </li>
      ))}
    </ul>
  );
}
