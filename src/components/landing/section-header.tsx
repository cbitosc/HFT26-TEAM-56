import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  label: string;
  title: ReactNode;
  description?: ReactNode;
  /** Heading scale. Sections use different sizes to keep a hierarchy. */
  size?: "md" | "lg" | "xl";
  align?: "start" | "center";
  /** `split` puts the description beside the heading from `lg` up. */
  layout?: "stacked" | "split";
  titleId?: string;
  className?: string;
};

const titleSizes = {
  md: "text-[1.75rem] leading-[1.15] tracking-[-0.035em] sm:text-[2.125rem] lg:text-[2.5rem] lg:leading-[1.1]",
  lg: "text-3xl leading-[1.12] tracking-[-0.04em] sm:text-4xl lg:text-5xl lg:leading-[1.06]",
  xl: "text-[2.25rem] leading-[1.06] tracking-[-0.042em] sm:text-5xl lg:text-[3.75rem] lg:leading-[1.02]",
} as const;

export function SectionHeader({
  label,
  title,
  description,
  size = "lg",
  align = "start",
  layout = "stacked",
  titleId,
  className,
}: SectionHeaderProps) {
  const centered = align === "center";
  const split = layout === "split" && !centered && description;

  return (
    <header
      className={cn(
        split &&
          "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-end lg:gap-16",
        centered && "text-center",
        className,
      )}
    >
      <div>
        <p
          className={cn(
            "type-label flex items-center gap-3 text-muted-foreground",
            centered && "justify-center",
          )}
        >
          <span aria-hidden="true" className="h-px w-5 bg-border-strong" />
          {label}
        </p>
        <h2
          id={titleId}
          className={cn(
            "mt-5 max-w-[22ch] font-medium text-balance",
            titleSizes[size],
            centered && "mx-auto",
          )}
        >
          {title}
        </h2>
      </div>
      {description ? (
        <p
          className={cn(
            "type-lead max-w-[36rem] text-muted-foreground",
            split ? "mt-5 lg:mt-0" : "mt-6",
            centered && "mx-auto text-balance",
          )}
        >
          {description}
        </p>
      ) : null}
    </header>
  );
}
