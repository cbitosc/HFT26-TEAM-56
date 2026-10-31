import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileBarChart } from "lucide-react";
import { formatDate } from "@/components/dashboard/assessment-list";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/ui/status";
import { getReportHistory } from "@/lib/data/assessments";
import { classificationLabel } from "@/lib/grading/report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Reports · vetted.",
};

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Scored results from your completed assessments." />
      <div className="mt-8">
        <Suspense fallback={<ListSkeleton label="Loading reports" />}>
          <Reports />
        </Suspense>
      </div>
    </>
  );
}

const STATUS_LABEL = { pending: "Evaluating", grading: "Evaluating", failed: "Grading failed" } as const;

const GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_6rem_9rem_1rem] sm:items-center sm:gap-4";

async function Reports() {
  const history = await getReportHistory();

  if (!history.length) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="No reports yet"
        description="Finish an assessment and its report will appear here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className={cn(GRID, "hidden border-b border-border bg-surface-1 px-4 py-2 text-xs text-faint")} aria-hidden="true">
        <span>Assessment</span>
        <span>Completed</span>
        <span className="text-right">Score</span>
        <span>Result</span>
        <span />
      </div>
      <ul className="divide-y divide-border">
        {history.map(({ row, result }) => {
          const scored = result?.finalScore !== null && result?.finalScore !== undefined && result.classification;
          return (
            <li key={row.id}>
              <Link
                href={`/dashboard/reports/${row.id}`}
                className={cn(
                  GRID,
                  "group flex items-center gap-4 px-4 py-3 outline-none transition-colors duration-150 hover:bg-foreground/[0.02] focus-visible:bg-foreground/[0.035]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{row.technical_domain ?? "Technical assessment"}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                    {formatDate(row.completed_at ?? row.created_at)}
                    {row.status === "expired" ? " · time ran out" : ""}
                  </span>
                  {row.status === "expired" ? (
                    <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">Time ran out</span>
                  ) : null}
                </span>
                <span className="hidden text-[13px] text-muted-foreground tabular-nums sm:block">
                  {formatDate(row.completed_at ?? row.created_at)}
                </span>
                {scored ? (
                  <>
                    <span className="text-right text-sm text-foreground tabular-nums">
                      {result.finalScore}
                      <span className="text-faint">/100</span>
                    </span>
                    <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
                      {classificationLabel(result.classification!)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:block" />
                    <StatusIndicator tone={result?.status === "failed" ? "danger" : "muted"}>
                      {STATUS_LABEL[(result?.status ?? "pending") as keyof typeof STATUS_LABEL] ?? "Evaluating"}
                    </StatusIndicator>
                  </>
                )}
                <ChevronRight
                  className="size-4 shrink-0 text-faint transition-colors group-hover:text-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
