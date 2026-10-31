import { Suspense } from "react";
import type { Metadata } from "next";
import { AssessmentStatus } from "@/components/assessment/assessment-status";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResumeOverview } from "@/components/dashboard/resume-overview";
import { ResumeUpload } from "@/components/dashboard/resume-upload";
import { SetupSteps } from "@/components/dashboard/setup-steps";
import { Skeleton } from "@/components/ui/skeleton";
import { displayName, getCurrentUser } from "@/lib/auth";
import { getLatestAssessmentForResume } from "@/lib/data/assessments";
import { getCurrentResume, getPendingResume } from "@/lib/data/resumes";

export const metadata: Metadata = {
  title: "Dashboard · vetted.",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

/**
 * Every state here comes from the database: no résumé, an upload still being
 * analysed, an analysed résumé, and its latest assessment's status. A refresh
 * at any point shows the same state.
 */
async function DashboardContent() {
  const [user, resume] = await Promise.all([getCurrentUser(), getCurrentResume()]);
  const name = displayName(user);

  if (resume) {
    const latest = await getLatestAssessmentForResume(resume.id);
    return (
      <ResumeOverview
        resume={resume}
        accountName={name}
        assessmentPanel={
          latest ? (
            <AssessmentStatus assessment={latest.assessment} resumeId={resume.id} serverNow={latest.serverNow} />
          ) : null
        }
      />
    );
  }

  const pending = await getPendingResume();
  return (
    <>
      <PageHeader
        title={`Welcome, ${name.split(" ")[0]}`}
        description="Upload your résumé to get an assessment built around your own work."
      />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <ResumeUpload pending={pending} />
        <SetupSteps className="lg:pt-6" />
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-[74px] rounded-lg" />
      <Skeleton className="h-36 rounded-lg" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
