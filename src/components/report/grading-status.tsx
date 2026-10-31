"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "pending" | "grading" | "completed" | "failed" | "not_finished";

const POLL_MS = 4_000;

/**
 * "Evaluating your assessment" until the report exists, then a link to it.
 * Never shows a score itself. On failure, offers a retry; answers are untouched.
 */
export function GradingStatus({
  assessmentId,
  initialStatus,
  initialFailure = null,
  refreshOnComplete = false,
}: {
  assessmentId: string;
  initialStatus: Status;
  initialFailure?: string | null;
  /** On the report page itself: reload to render the report once it's ready. */
  refreshOnComplete?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [failure, setFailure] = useState<string | null>(initialFailure);
  const [retrying, setRetrying] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (status === "completed" || status === "failed") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/assessments/${assessmentId}/results`, { cache: "no-store" });
        const body = (await response.json()) as { status?: Status; failureReason?: string | null };
        if (cancelled || !response.ok || !body.status) return;
        setOffline(false);
        setStatus(body.status);
        setFailure(body.failureReason ?? null);
        if (body.status === "completed" && refreshOnComplete) router.refresh();
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    const id = setInterval(poll, POLL_MS);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [assessmentId, status, refreshOnComplete, router]);

  async function retry() {
    setRetrying(true);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/grade`, { method: "POST" });
      if (response.ok) {
        setFailure(null);
        setStatus("pending");
      }
    } catch {
      setOffline(true);
    } finally {
      setRetrying(false);
    }
  }

  if (status === "completed") {
    return (
      <div aria-live="polite">
        <CircleCheck className="size-5 text-primary" aria-hidden="true" />
        <h2 className="mt-4 text-lg tracking-[-0.02em] text-foreground">Your report is ready</h2>
        <p className="type-body mt-2 text-muted-foreground">Every answer has been graded.</p>
        <Button asChild className="mt-6">
          <Link href={`/dashboard/reports/${assessmentId}`}>View Performance Report</Link>
        </Button>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div aria-live="polite">
        <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
        <h2 className="mt-4 text-lg tracking-[-0.02em] text-foreground">We couldn&apos;t finish grading</h2>
        <p className="type-body mt-2 text-muted-foreground">
          {failure ?? "Grading stopped before it finished."} Your submitted answers are saved and won&apos;t change.
        </p>
        <Button className="mt-6" onClick={retry} disabled={retrying}>
          {retrying ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Retry grading
        </Button>
      </div>
    );
  }

  return (
    <div aria-live="polite" aria-busy="true">
      <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-lg tracking-[-0.02em] text-foreground">Evaluating your assessment</h2>
      <p className="type-body mt-2 text-muted-foreground">
        Your responses are being evaluated. Your performance report will be available shortly.
      </p>
      {offline ? <p className="mt-3 text-[13px] text-destructive">Connection lost. Retrying…</p> : null}
    </div>
  );
}
