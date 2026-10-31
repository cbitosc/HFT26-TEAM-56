import Link from "next/link";
import { STATUS_LABEL, formatDate, hrefFor } from "@/components/dashboard/assessment-list";
import { getAssessmentHistory } from "@/lib/data/assessments";
import { cn } from "@/lib/utils";

const SHOWN = 5;

/**
 * The newest few assessments for quick access from the sidebar. The sidebar
 * is navigation, so a failed read here renders nothing instead of taking the
 * whole page down; the Assessments page reports the error.
 */
export async function RecentAssessments() {
  let rows: Awaited<ReturnType<typeof getAssessmentHistory>>;
  try {
    rows = await getAssessmentHistory();
  } catch {
    return null;
  }

  if (!rows.length) {
    return <p className="px-2 py-1.5 text-xs text-faint">No assessments yet</p>;
  }

  return (
    <ul className="space-y-px">
      {rows.slice(0, SHOWN).map((row) => {
        const live = row.status === "in_progress" || row.status === "ready";
        return (
          <li key={row.id}>
            <Link
              href={hrefFor(row)}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  live ? "bg-primary" : row.status === "failed" ? "bg-destructive" : "bg-foreground/25",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-5 text-foreground/90">
                  {row.technical_domain ?? "Technical assessment"}
                </span>
                <span className="block truncate text-xs leading-4 text-faint">
                  {STATUS_LABEL[row.status]} · {formatDate(row.created_at)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function RecentAssessmentsSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-2 px-2 py-1.5">
      {[0, 1].map((index) => (
        <div key={index} className="space-y-1.5">
          <div className="h-3 w-36 rounded bg-surface-2" />
          <div className="h-2.5 w-24 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
