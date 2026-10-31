import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Assessment · vetted.",
};

export default function AssessmentPage() {
  return (
    <div>
      <p className="type-label text-faint">Assessment</p>
      <h1 className="mt-3 text-3xl tracking-[-0.04em]">Start an assessment</h1>
      <p className="type-body mt-2 text-muted-foreground">
        Assessments built from your repositories will be available here soon.
      </p>
    </div>
  );
}
