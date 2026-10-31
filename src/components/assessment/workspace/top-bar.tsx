import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight, Lock } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import type { Tier } from "@/lib/assessment/config";
import type { SessionStage } from "@/lib/assessment/session";
import { formatClock, stageTitle } from "@/lib/assessment/stages";
import { cn } from "@/lib/utils";

type TopBarProps = {
  stages: SessionStage[];
  currentTier: Tier | null;
  stageMs?: number;
  totalMs?: number;
  /** Hide the wordmark where the navigation rail already shows the logo. */
  compact?: boolean;
  /** Question navigation for the open stage, at the start of the bar. */
  nav?: ReactNode;
  /** Controls before the timers, e.g. the Vetted AI toggle. */
  tools?: ReactNode;
  /** The primary action at the end of the bar. */
  actions?: ReactNode;
};

/**
 * The assessment's one bar: questions and stages on the left, time and the
 * stage action on the right. The stage chips name the current stage, the
 * question buttons mark the open question, so neither is repeated as a title.
 */
export function AssessmentTopBar({ stages, currentTier, stageMs, totalMs, compact = false, nav, tools, actions }: TopBarProps) {
  const running = currentTier !== null && stageMs !== undefined && totalMs !== undefined;
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background">
      {currentTier ? <h2 className="sr-only">{stageTitle(currentTier)}</h2> : null}
      <div className="flex h-13 items-center gap-3 px-2 sm:px-3">
        <Link
          href="/dashboard"
          aria-label="vetted. dashboard"
          className={cn("shrink-0 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50", compact && "lg:hidden")}
        >
          <Wordmark withMark />
        </Link>

        {nav}

        <StageProgress
          stages={stages}
          className={cn(nav ? "hidden lg:flex" : "ml-auto", nav && "border-l border-border pl-3")}
        />

        {running || tools || actions ? (
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {tools}
            {running ? (
              <div className="flex items-center gap-3">
                <Clock label="Stage" ms={stageMs} warnBelowMs={2 * 60_000} />
                <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
                <Clock label="Total" ms={totalMs} muted className="hidden sm:flex" />
              </div>
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function Clock({
  label,
  ms,
  warnBelowMs,
  muted,
  className,
}: {
  label: string;
  ms: number;
  warnBelowMs?: number;
  muted?: boolean;
  className?: string;
}) {
  const low = warnBelowMs !== undefined && ms <= warnBelowMs;
  return (
    <div className={cn("flex items-baseline gap-1.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        role="timer"
        aria-label={`${label} time: ${formatClock(ms)} remaining`}
        className={cn(
          "font-mono text-sm tabular-nums",
          low ? "text-destructive" : muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {formatClock(ms)}
      </span>
    </div>
  );
}

/**
 * Novice → Adept → Master. Informational only: stages can't be opened from
 * here, and the server refuses work outside the open stage anyway.
 */
export function StageProgress({ stages, className }: { stages: SessionStage[]; className?: string }) {
  return (
    <ol className={cn("flex items-center gap-1 text-xs", className)} aria-label="Assessment stages">
      {stages.map((stage, index) => {
        const done = stage.status === "submitted" || stage.status === "expired";
        const current = stage.status === "active";
        return (
          <li key={stage.tier} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight aria-hidden="true" className="size-3 text-faint" /> : null}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-2",
                current && "bg-primary/10 font-medium text-foreground ring-1 ring-primary/40 ring-inset",
                done && "text-muted-foreground",
                !current && !done && "text-faint",
              )}
            >
              {done ? <Check className="size-3 text-primary" aria-hidden="true" /> : null}
              {!current && !done ? <Lock className="size-3" aria-hidden="true" /> : null}
              {stage.label}
              <span className="sr-only">
                {done ? (stage.status === "expired" ? " (time ran out)" : " (completed)") : current ? " (current)" : " (locked)"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
