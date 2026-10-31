import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AssessmentStatus } from "@/components/assessment/assessment-status";
import { formatDate } from "@/components/dashboard/assessment-list";
import { BackLink, PageHeader, PageHeaderSkeleton, SectionHeading } from "@/components/dashboard/page-header";
import { isUuid } from "@/lib/api/http";
import {
  LANGUAGE_LABEL,
  QUESTION_TYPE_LABEL,
  type CodeLanguage,
  type QuestionType,
} from "@/lib/assessment/config";
import type { PublicAssessment, QuestionOutline } from "@/lib/assessment/public";
import { getOwnAssessment } from "@/lib/data/assessments";

export const metadata: Metadata = {
  title: "Assessment · vetted.",
};

type Params = PageProps<"/dashboard/assessments/[id]">["params"];

export default function AssessmentPage({ params }: PageProps<"/dashboard/assessments/[id]">) {
  return (
    <>
      <BackLink href="/dashboard/assessments">Assessments</BackLink>
      <div className="mt-5">
        <Suspense fallback={<PageHeaderSkeleton />}>
          <AssessmentContent params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function AssessmentContent({ params }: { params: Params }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const found = await getOwnAssessment(id);
  if (!found) notFound();
  const { row, assessment, serverNow } = found;

  // Once started, the assessment lives at /assessment/[id].
  if (assessment.contentVisible) redirect(`/assessment/${assessment.id}`);

  const meta = [assessment.technicalDomain, assessment.resumeFilename, `Generated ${formatDate(assessment.createdAt)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader title="Your assessment" description={meta} />
      <div className="mt-6">
        <AssessmentStatus assessment={assessment} resumeId={row.resume_id} serverNow={serverNow} openAfterGenerate />
      </div>
      {assessment.status === "ready" ? <Outline assessment={assessment} /> : null}
    </>
  );
}

function typeLabel(type: string, language: string | null) {
  const base = QUESTION_TYPE_LABEL[type as QuestionType] ?? type;
  return language ? `${base} · ${LANGUAGE_LABEL[language as CodeLanguage] ?? language}` : base;
}

/** Question types and time per question; content stays hidden until the start. */
function Outline({ assessment }: { assessment: PublicAssessment }) {
  return (
    <section aria-labelledby="outline-heading" className="mt-10">
      <SectionHeading id="outline-heading" title="What to expect" />
      <div className="mt-3 grid gap-6 lg:grid-cols-3">
        {assessment.tiers.map((tier) => (
          <div key={tier.tier}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[13px] font-medium text-foreground">{tier.label}</h3>
              <p className="text-xs text-faint">
                {tier.minutes} min · {tier.aiAssistance ? "AI assistance" : "No AI"}
              </p>
            </div>
            <ol className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
              {(tier.questions as QuestionOutline[]).map((question) => (
                <li key={question.order} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-[13px]">
                  <span className="text-foreground">{typeLabel(question.type, question.language)}</span>
                  <span className="shrink-0 text-xs text-faint tabular-nums">{question.timeMinutes} min</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
