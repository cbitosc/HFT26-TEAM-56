import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusIndicator, type StatusTone } from "@/components/ui/status";
import type { AssessmentHistoryRow } from "@/lib/assessment/store";
import type { AssessmentStatus } from "@/types/database";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<AssessmentStatus, string> = {
  pending: "Pending",
  generating: "Generating",
  ready: "Ready",
  in_progress: "In progress",
  completed: "Completed",
  expired: "Expired",
  failed: "Failed",
};

const STATUS_TONE: Record<AssessmentStatus, StatusTone> = {
  pending: "muted",
  generating: "muted",
  ready: "accent",
  in_progress: "accent",
  completed: "neutral",
  expired: "muted",
  failed: "danger",
};

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Running assessments open where they're taken, finished ones their report, the rest their status page. */
export function hrefFor(assessment: Pick<AssessmentHistoryRow, "id" | "status">) {
  if (assessment.status === "in_progress") return `/assessment/${assessment.id}`;
  if (assessment.status === "completed" || assessment.status === "expired") return `/dashboard/reports/${assessment.id}`;
  return `/dashboard/assessments/${assessment.id}`;
}

export const ACTION_LABEL: Partial<Record<AssessmentStatus, string>> = {
  ready: "Open",
  in_progress: "Continue",
  generating: "View progress",
  completed: "View report",
  expired: "View report",
};

export function AssessmentStatusIndicator({ status }: { status: AssessmentStatus }) {
  return <StatusIndicator tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusIndicator>;
}

const GRID =
  "md:grid md:grid-cols-[minmax(0,1.6fr)_7rem_6.5rem_5rem_7rem_7.5rem] md:items-center md:gap-4";

/** Assessment history. Shows only the assessment row and a question count, never question content. */
export function AssessmentList({ assessments }: { assessments: AssessmentHistoryRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        className={cn(GRID, "hidden border-b border-border bg-surface-1 px-4 py-2 text-xs text-faint")}
        aria-hidden="true"
      >
        <span>Assessment</span>
        <span>Created</span>
        <span className="text-right">Questions</span>
        <span className="text-right">Duration</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="divide-y divide-border">
        {assessments.map((assessment) => {
          const action = ACTION_LABEL[assessment.status] ?? "View";
          return (
            <li key={assessment.id}>
              <Link
                href={hrefFor(assessment)}
                aria-label={`${action}: assessment from ${formatDate(assessment.created_at)}, ${STATUS_LABEL[assessment.status]}`}
                className={cn(
                  GRID,
                  "group flex flex-col gap-1 px-4 py-3 text-sm outline-none transition-colors duration-150 hover:bg-foreground/[0.02] focus-visible:bg-foreground/[0.035]",
                )}
              >
                <span className="flex min-w-0 items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">
                      {assessment.technical_domain ?? "Technical assessment"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {assessment.resume_filename ?? "Résumé removed"}
                    </span>
                  </span>
                  <span className="shrink-0 md:hidden">
                    <AssessmentStatusIndicator status={assessment.status} />
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums md:text-[13px]">
                  {formatDate(assessment.created_at)}
                  <span className="md:hidden">
                    {" · "}
                    {assessment.question_count ? `${assessment.question_count} questions · ` : ""}
                    {assessment.duration_minutes} min
                  </span>
                </span>
                <span className="hidden text-right text-[13px] text-muted-foreground tabular-nums md:block">
                  {assessment.question_count || "—"}
                </span>
                <span className="hidden text-right text-[13px] text-muted-foreground tabular-nums md:block">
                  {assessment.duration_minutes} min
                </span>
                <span className="hidden md:block">
                  <AssessmentStatusIndicator status={assessment.status} />
                </span>
                <span className="hidden items-center justify-end gap-1 text-[13px] text-muted-foreground transition-colors group-hover:text-foreground md:flex">
                  {action}
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
