"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, LoaderCircle } from "lucide-react";
import { GENERATION_STAGES, type GenerationStage } from "@/lib/assessment/config";
import { cn } from "@/lib/utils";

const POLL_MS = 3_000;

const STAGE_LABEL: Record<GenerationStage, string> = {
  analyzing: "Analysing technical background",
  generating: "Generating personalised questions",
  validating: "Validating assessment challenges",
  preparing: "Preparing assessment",
};

function secondsBetween(fromIso: string, now: number) {
  return Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 1000));
}

type GenerationProgressProps = {
  assessmentId: string;
  createdAt: string;
  stage: GenerationStage | null;
  /** The server's clock at render; the device clock is only read after mounting. */
  serverNow: number;
};

/**
 * Shows the stage the server has recorded for a generating assessment, polls
 * for changes, and refreshes the page once generation finishes or fails.
 */
export function GenerationProgress({ assessmentId, createdAt, stage: initialStage, serverNow }: GenerationProgressProps) {
  const router = useRouter();
  const [stage, setStage] = useState<GenerationStage>(initialStage ?? "analyzing");
  const [elapsed, setElapsed] = useState(() => secondsBetween(createdAt, serverNow));

  useEffect(() => {
    let cancelled = false;
    const offset = serverNow - Date.now();
    const tick = setInterval(() => setElapsed(secondsBetween(createdAt, Date.now() + offset)), 1_000);
    const poll = setInterval(async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/assessments/${assessmentId}`, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 404) {
          router.refresh();
          return;
        }
        if (!response.ok) return;
        const { assessment } = (await response.json()) as {
          assessment: { status: string; generationStage: GenerationStage | null };
        };
        if (cancelled) return;
        if (assessment.status !== "generating") router.refresh();
        else if (assessment.generationStage) setStage(assessment.generationStage);
      } catch {
        // Transient network error: try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [assessmentId, createdAt, serverNow, router]);

  const current = GENERATION_STAGES.indexOf(stage);
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <section aria-labelledby="generation-heading" className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            Generating
          </p>
          <h2 id="generation-heading" className="mt-2 text-base font-medium tracking-[-0.02em] text-foreground">
            Generating your assessment
          </h2>
        </div>
        <span className="font-mono text-xs text-faint tabular-nums" aria-label={`${minutes} minutes ${seconds} seconds elapsed`}>
          {minutes}:{seconds}
        </span>
      </div>

      <ol className="mt-4 space-y-2.5 rounded-md border border-border bg-surface-1 px-4 py-3.5" aria-live="polite">
        {GENERATION_STAGES.map((key, index) => {
          const state = index < current ? "done" : index === current ? "active" : "pending";
          return (
            <li
              key={key}
              className={cn(
                "flex items-center gap-2.5 text-[13px]",
                state === "pending" ? "text-faint" : "text-foreground",
              )}
            >
              {state === "done" ? (
                <Check className="size-4 text-primary" aria-hidden="true" />
              ) : state === "active" ? (
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : (
                <Circle className="size-4 text-border-strong" aria-hidden="true" />
              )}
              {STAGE_LABEL[key]}
              <span className="sr-only">
                {state === "done" ? "(done)" : state === "active" ? "(in progress)" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 max-w-xl text-[13px] leading-5 text-muted-foreground">
        This usually takes two to three minutes. Your progress is saved, so you can leave this page.
        The timer starts only when you choose to begin.
      </p>
    </section>
  );
}
