"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiErrorBody } from "@/lib/resumes/constants";
import { cn } from "@/lib/utils";

type GenerateAssessmentButtonProps = {
  resumeId: string;
  label?: string;
  /** Go to the new assessment's page instead of refreshing the current one. */
  openAfter?: boolean;
  className?: string;
};

/**
 * Asks the server to generate an assessment. The server returns the existing
 * one if a generation is already running, so repeated clicks can't duplicate it;
 * the button also stays disabled until the page shows the new state.
 */
export function GenerateAssessmentButton({
  resumeId,
  label = "Generate My Assessment",
  openAfter = false,
  className,
}: GenerateAssessmentButtonProps) {
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pending = requesting || refreshing;

  async function generate() {
    if (pending) return;
    setRequesting(true);
    setError(null);
    try {
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(body?.error?.message ?? "We couldn't start generating your assessment.");
        return;
      }
      const { assessmentId } = (await response.json()) as { assessmentId: string };
      startRefresh(() => {
        if (openAfter) router.push(`/dashboard/assessments/${assessmentId}`);
        else router.refresh();
      });
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" onClick={generate} disabled={pending} className={cn(className)}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        {pending ? "Starting…" : label}
      </Button>
      <p role="alert" aria-live="polite" className="max-w-72 text-xs text-destructive empty:hidden">
        {error}
      </p>
    </div>
  );
}
