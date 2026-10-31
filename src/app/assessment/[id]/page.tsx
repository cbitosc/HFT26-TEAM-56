import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AssessmentWorkspace } from "@/components/assessment/workspace/assessment-workspace";
import { CompletionScreen } from "@/components/assessment/workspace/completion-screen";
import { isUuid } from "@/lib/api/http";
import { getOwnAssessmentSession } from "@/lib/data/assessments";

export const metadata: Metadata = {
  title: "Assessment · vetted.",
};

type Params = PageProps<"/assessment/[id]">["params"];

export default function TakeAssessmentPage({ params }: PageProps<"/assessment/[id]">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <AssessmentContent params={params} />
    </Suspense>
  );
}

async function AssessmentContent({ params }: { params: Params }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const found = await getOwnAssessmentSession(id);
  if (!found) notFound();
  // Not started (or not generated): the ready screen and Start button live on the dashboard.
  if (!found.session) redirect(`/dashboard/assessments/${id}`);

  const { session } = found;
  if (session.status !== "in_progress" || !session.currentTier) return <CompletionScreen session={session} />;
  // Keyed by stage so a new stage starts from a clean workspace.
  return <AssessmentWorkspace key={session.currentTier} initialSession={session} />;
}

function WorkspaceSkeleton() {
  return (
    <div className="flex h-dvh bg-background lg:gap-2 lg:bg-canvas lg:p-2" aria-busy="true" aria-label="Loading assessment">
      <div className="on-sidebar hidden w-[52px] shrink-0 rounded-xl lg:block" />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-xl lg:border lg:border-border">
        <div className="h-13 shrink-0 border-b border-border" />
        <div className="flex min-h-0 flex-1">
          <div className="w-full space-y-3 px-5 py-7 sm:px-7 lg:w-2/5">
            <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
            <div className="h-5 w-72 max-w-full animate-pulse rounded bg-surface-2" />
            <div className="h-24 animate-pulse rounded bg-surface-1" />
          </div>
          <div className="hidden flex-1 border-l border-border bg-card lg:block" />
        </div>
      </div>
    </div>
  );
}
