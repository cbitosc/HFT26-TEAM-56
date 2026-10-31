"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiErrorBody } from "@/lib/resumes/constants";

/**
 * Starts the timer on the server (ready -> in_progress, deadline recorded by
 * the database) and opens the assessment. Starting again is harmless: the
 * server keeps the original start time.
 */
export function StartAssessmentButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/start`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(body?.error?.message ?? "We couldn't start your assessment.");
        setPending(false);
        router.refresh();
        return;
      }
      router.push(`/assessment/${assessmentId}`);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" onClick={start} disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        {pending ? "Starting…" : "Start Assessment"}
      </Button>
      <p role="alert" aria-live="polite" className="text-xs text-destructive empty:hidden">
        {error}
      </p>
    </div>
  );
}
