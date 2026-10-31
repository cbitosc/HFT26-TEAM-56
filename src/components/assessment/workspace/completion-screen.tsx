import Link from "next/link";
import { AssessmentTopBar } from "@/components/assessment/workspace/top-bar";
import { GradingStatus } from "@/components/report/grading-status";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/ui/status";
import type { AssessmentSession } from "@/lib/assessment/session";

/** Shown once Master is submitted or time runs out: answers are locked and grading runs. */
export function CompletionScreen({ session }: { session: AssessmentSession }) {
  const timedOut = session.status === "expired";
  return (
    <>
      <AssessmentTopBar stages={session.stages} currentTier={null} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <StatusIndicator tone={timedOut ? "muted" : "accent"}>
          {timedOut ? "Time's up · assessment submitted" : "Assessment submitted"}
        </StatusIndicator>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Your answers are saved and locked{timedOut ? " (the time ran out)" : ""}.
        </p>

        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <GradingStatus assessmentId={session.assessmentId} initialStatus="pending" />
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          {session.summary ? (
            <p className="border-b border-border bg-surface-1 px-4 py-2.5 text-[13px] text-foreground tabular-nums">
              {session.summary.answered} of {session.summary.total} questions answered
            </p>
          ) : null}
          <ul className="divide-y divide-border text-[13px]">
            {session.stages.map((stage) => (
              <li key={stage.tier} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="text-foreground">{stage.label}</span>
                <StatusIndicator tone={stage.status === "submitted" ? "neutral" : "muted"}>
                  {stage.status === "submitted" ? "Submitted" : stage.startedAt ? "Time ran out" : "Not reached"}
                </StatusIndicator>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8">
          <Button asChild variant="ghost">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
