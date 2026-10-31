import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Primary page action, aligned to the title on wide screens. */
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight tracking-[-0.025em] sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

/** Heading for a block within a page, with an optional count or note and an action. */
export function SectionHeading({
  id,
  title,
  meta,
  action,
}: {
  id?: string;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-4">
      <h2 id={id} className="flex items-baseline gap-2 text-sm font-medium tracking-[-0.01em] text-foreground">
        {title}
        {meta !== undefined && meta !== null ? (
          <span className="text-xs font-normal text-faint tabular-nums">{meta}</span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex items-center gap-1.5 rounded-sm px-1 text-[13px] text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      {children}
    </Link>
  );
}
