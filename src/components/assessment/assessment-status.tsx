import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Countdown } from "@/components/assessment/countdown";
import { StartAssessmentButton } from "@/components/assessment/start-assessment-button";
import { GenerateAssessmentButton } from "@/components/dashboard/generate-assessment-button";
import { GenerationProgress } from "@/components/dashboard/generation-progress";
import { Button } from "@/components/ui/button";
import { StatusIndicator, type StatusTone } from "@/components/ui/status";
import type { PublicAssessment } from "@/lib/assessment/public";
import { cn } from "@/lib/utils";

// The assessment's state as the candidate sees it: generating, ready to
// start, underway, failed or ended. Shared by the dashboard and the
// assessment detail page; every state comes from the stored row.

function Panel({
  labelledBy,
  status,
  title,
  tone = "default",
  actions,
  children,
}: {
  labelledBy: string;
  status: { tone: StatusTone; label: string };
  title: ReactNode;
  tone?: "default" | "error";
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        "rounded-lg border p-5 sm:p-6",
        tone === "error" ? "border-destructive/30 bg-destructive/[0.04]" : "border-border bg-card",
      )}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <StatusIndicator tone={status.tone}>{status.label}</StatusIndicator>
          <h2 id={labelledBy} className="mt-2 text-base font-medium tracking-[-0.02em] text-foreground">
            {title}
          </h2>
          {children}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </section>
  );
}

export function AssessmentBreakdown({ assessment }: { assessment: PublicAssessment }) {
  return (
    <table className="w-full max-w-md text-[13px]">
      <caption className="sr-only">Questions and time per tier</caption>
      <thead>
        <tr className="border-b border-border text-left text-xs text-faint">
          <th scope="col" className="py-2 pr-4 font-normal">Stage</th>
          <th scope="col" className="py-2 pr-4 font-normal">AI</th>
          <th scope="col" className="py-2 pr-4 text-right font-normal">Questions</th>
          <th scope="col" className="py-2 text-right font-normal">Duration</th>
        </tr>
      </thead>
      <tbody>
        {assessment.tiers.map((tier) => (
          <tr key={tier.tier} className="border-b border-border last:border-b-0">
            <th scope="row" className="py-2 pr-4 text-left font-normal text-foreground">
              {tier.label}
              <span className="ml-1.5 text-faint capitalize">{tier.difficulty}</span>
            </th>
            <td className="py-2 pr-4 text-muted-foreground">{tier.aiAssistance ? "Allowed" : "Off"}</td>
            <td className="py-2 pr-4 text-right tabular-nums text-foreground">{tier.questions.length}</td>
            <td className="py-2 text-right tabular-nums text-foreground">{tier.minutes} min</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AssessmentReady({ assessment }: { assessment: PublicAssessment }) {
  const noAi = assessment.tiers.filter((tier) => !tier.aiAssistance).map((tier) => tier.label);
  return (
    <Panel
      labelledBy="assessment-ready-heading"
      status={{ tone: "accent", label: "Ready to start" }}
      title="Your assessment is ready"
      actions={
        <div className="flex flex-col items-start gap-2 md:items-end">
          <StartAssessmentButton assessmentId={assessment.id} />
          <p className="text-xs text-faint">The timer starts when you click Start Assessment.</p>
        </div>
      }
    >
      <p className="mt-1 max-w-xl text-[13px] leading-5 text-muted-foreground">
        {assessment.questionCount} personalised questions across three difficulty levels. You have{" "}
        {assessment.durationMinutes} minutes to complete the assessment.
      </p>
      <div className="mt-4">
        <AssessmentBreakdown assessment={assessment} />
      </div>
      {noAi.length ? (
        <p className="mt-3 text-xs text-faint">{noAi.join(", ")} questions are answered without AI assistance.</p>
      ) : null}
    </Panel>
  );
}

export function AssessmentInProgress({ assessment, serverNow }: { assessment: PublicAssessment; serverNow: number }) {
  return (
    <Panel
      labelledBy="assessment-progress-heading"
      status={{ tone: "accent", label: "In progress" }}
      title="Assessment in progress"
      actions={
        <Button asChild>
          <Link href={`/assessment/${assessment.id}`}>
            Continue assessment
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <p className="mt-1 text-[13px] text-muted-foreground">
        {assessment.expiresAt ? (
          <>
            <Countdown expiresAt={assessment.expiresAt} serverNow={serverNow} className="font-medium" /> left of{" "}
            {assessment.durationMinutes} minutes.
          </>
        ) : null}
      </p>
    </Panel>
  );
}

type RetryProps = {
  assessment: PublicAssessment;
  resumeId: string | null;
  /** Open the new assessment's page after generating, instead of refreshing this one. */
  openAfterGenerate?: boolean;
};

export function AssessmentFailed({ assessment, resumeId, openAfterGenerate }: RetryProps) {
  return (
    <Panel
      labelledBy="assessment-failed-heading"
      tone="error"
      status={{ tone: "danger", label: "Generation failed" }}
      title="We couldn't generate your assessment"
      actions={
        resumeId ? <GenerateAssessmentButton resumeId={resumeId} label="Try again" openAfter={openAfterGenerate} /> : null
      }
    >
      <p className="mt-1 max-w-xl text-[13px] leading-5 text-muted-foreground">
        {assessment.failureReason ?? "Something went wrong while generating your assessment."}
      </p>
      {resumeId ? null : (
        <p className="mt-3 text-[13px] text-muted-foreground">
          The résumé it was generated from has been replaced.{" "}
          <Link href="/dashboard" className="text-primary underline-offset-2 hover:underline">
            Generate from your current résumé
          </Link>
          .
        </p>
      )}
    </Panel>
  );
}

const ENDED_LABEL = { completed: "completed", expired: "ended when time ran out" } as const;

export function AssessmentEnded({ assessment, resumeId, openAfterGenerate }: RetryProps) {
  const label = ENDED_LABEL[assessment.status as keyof typeof ENDED_LABEL] ?? "ended";
  return (
    <Panel
      labelledBy="assessment-ended-heading"
      status={{ tone: "neutral", label: assessment.status === "expired" ? "Time ran out" : "Completed" }}
      title={`Your last assessment ${label}`}
      actions={
        resumeId ? (
          <GenerateAssessmentButton resumeId={resumeId} label="Generate a new assessment" openAfter={openAfterGenerate} />
        ) : null
      }
    >
      <p className="mt-1 text-[13px] text-muted-foreground">
        <Link href={`/assessment/${assessment.id}`} className="text-primary underline-offset-2 hover:underline">
          View it
        </Link>{" "}
        or generate a new one from your résumé.
      </p>
    </Panel>
  );
}

/** Picks the panel for the assessment's current status. */
export function AssessmentStatus({
  assessment,
  resumeId,
  serverNow,
  openAfterGenerate,
}: RetryProps & { serverNow: number }) {
  switch (assessment.status) {
    case "generating":
    case "pending":
      return (
        <GenerationProgress
          assessmentId={assessment.id}
          createdAt={assessment.createdAt}
          stage={assessment.generationStage}
          serverNow={serverNow}
        />
      );
    case "ready":
      return <AssessmentReady assessment={assessment} />;
    case "in_progress":
      return <AssessmentInProgress assessment={assessment} serverNow={serverNow} />;
    case "failed":
      return <AssessmentFailed assessment={assessment} resumeId={resumeId} openAfterGenerate={openAfterGenerate} />;
    default:
      return <AssessmentEnded assessment={assessment} resumeId={resumeId} openAfterGenerate={openAfterGenerate} />;
  }
}
