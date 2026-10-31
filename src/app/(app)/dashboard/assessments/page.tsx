import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { AssessmentList } from "@/components/dashboard/assessment-list";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/skeleton";
import { getAssessmentHistory } from "@/lib/data/assessments";

export const metadata: Metadata = {
  title: "Assessments · vetted.",
};

export default function AssessmentsPage() {
  return (
    <>
      <PageHeader
        title="Assessments"
        description="Every assessment generated from your résumés."
      />
      <div className="mt-8">
        <Suspense fallback={<ListSkeleton label="Loading assessments" />}>
          <Assessments />
        </Suspense>
      </div>
    </>
  );
}

async function Assessments() {
  const assessments = await getAssessmentHistory();

  if (!assessments.length) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No assessments yet"
        description="Submit your résumé and your first assessment will appear here."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">Submit your résumé</Link>
          </Button>
        }
      />
    );
  }

  return <AssessmentList assessments={assessments} />;
}
