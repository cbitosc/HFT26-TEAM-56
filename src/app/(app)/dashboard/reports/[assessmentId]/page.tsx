import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { formatDate } from "@/components/dashboard/assessment-list";
import { BackLink, PageHeader, PageHeaderSkeleton } from "@/components/dashboard/page-header";
import { GradingStatus } from "@/components/report/grading-status";
import { ReportView } from "@/components/report/report-view";
import { isUuid } from "@/lib/api/http";
import { getOwnReport } from "@/lib/data/assessments";

export const metadata: Metadata = {
  title: "Performance report · vetted.",
};

type Params = PageProps<"/dashboard/reports/[assessmentId]">["params"];

export default function ReportPage({ params }: PageProps<"/dashboard/reports/[assessmentId]">) {
  return (
    <>
      <BackLink href="/dashboard/reports">Reports</BackLink>
      <div className="mt-5">
        <Suspense fallback={<PageHeaderSkeleton />}>
          <ReportContent params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function ReportContent({ params }: { params: Params }) {
  const { assessmentId } = await params;
  if (!isUuid(assessmentId)) notFound();
  // Ownership: only the signed-in user's own assessment is found.
  const found = await getOwnReport(assessmentId);
  if (!found) notFound();
  const { row, result } = found;
  if (row.status !== "completed" && row.status !== "expired") {
    redirect(row.status === "in_progress" ? `/assessment/${row.id}` : `/dashboard/assessments/${row.id}`);
  }

  const meta = [row.technical_domain, row.completed_at ? `Completed ${formatDate(row.completed_at)}` : null].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader title="Performance report" description={meta} />
      <div className="mt-8">
        {result?.report ? (
          <ReportView report={result.report} />
        ) : (
          <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <GradingStatus
            assessmentId={row.id}
            initialStatus={result?.status === "failed" ? "failed" : "pending"}
            initialFailure={result?.failureReason ?? null}
            refreshOnComplete
          />
          </div>
        )}
      </div>
    </>
  );
}
