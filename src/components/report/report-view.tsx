import type { ReactNode } from "react";
import { Check, ChevronDown, Minus, X } from "lucide-react";
import { DifficultyBadge, typeLabel } from "@/components/assessment/workspace/question-details";
import { Chip as SkillBadge } from "@/components/ui/chip";
import { StageChart } from "@/components/report/stage-chart";
import { CLASSIFICATIONS } from "@/lib/assessment/scoring";
import { classificationLabel, type QuestionResult, type SkillResult } from "@/lib/grading/report";
import type { StoredResult } from "@/lib/grading/results";
import { cn } from "@/lib/utils";

type Report = NonNullable<StoredResult["report"]>;

const fmt = (value: number, digits = 1) => (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, "");

function duration(seconds: number | null) {
  if (seconds === null) return "Not recorded";
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={`section-${id}`} aria-labelledby={id} className="scroll-mt-8">
      <h2 id={id} className="text-[15px] font-medium tracking-[-0.015em] text-foreground">
        {title}
      </h2>
      {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground tabular-nums">
          {fmt(value)} <span className="text-faint">/ {max}</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

/** A: overall score and components. */
function Overall({ report }: { report: Report }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-border bg-card md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className="border-b border-border p-6 md:border-r md:border-b-0">
        <p className="text-xs text-muted-foreground">Overall score</p>
        <p className="mt-2 text-5xl tracking-[-0.05em] text-foreground tabular-nums">
          {fmt(report.finalScore)}
          <span className="text-2xl text-faint">/100</span>
        </p>
        <p className="mt-3 inline-flex h-6 items-center rounded-md border border-primary/40 bg-primary/[0.06] px-2 text-xs text-primary">
          {classificationLabel(report.classification)}
        </p>
      </div>
      <div className="space-y-4 p-6">
        <Meter label="Technical correctness" value={report.correctnessScore} max={70} />
        <Meter label="Performance" value={report.performanceScore} max={10} />
        <Meter label="AI usage efficiency" value={report.aiEfficiencyScore} max={20} />
        <dl className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 text-[13px]">
          <div>
            <dt className="text-muted-foreground">Questions completed</dt>
            <dd className="mt-0.5 text-foreground tabular-nums">
              {report.summary.questionsCompleted} of {report.summary.questionCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total time</dt>
            <dd className="mt-0.5 text-foreground tabular-nums">
              {duration(report.summary.totalSeconds)}
              {report.summary.endedBy === "time" ? <span className="text-faint"> · time ran out</span> : null}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** B: stage comparison. */
function Stages({ report }: { report: Report }) {
  return (
    <div className="grid gap-6 rounded-lg border border-border bg-card p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <StageChart stages={report.stageResults} />
      <table className="w-full text-[13px]">
        <thead className="text-left text-xs text-faint">
          <tr>
            <th className="pb-2 font-normal">Stage</th>
            <th className="pb-2 text-right font-normal">Score</th>
            <th className="pb-2 text-right font-normal">Answered</th>
            <th className="pb-2 text-right font-normal">Time used</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {report.stageResults.map((stage) => (
            <tr key={stage.tier}>
              <td className="py-2 text-foreground">{stage.label}</td>
              <td className="py-2 text-right tabular-nums">{Math.round(stage.percent)}%</td>
              <td className="py-2 text-right tabular-nums">
                {stage.attempted}/{stage.questionCount}
              </td>
              <td className="py-2 text-right text-muted-foreground tabular-nums">
                {stage.timeSpentSeconds === null ? "—" : `${Math.round(stage.timeSpentSeconds / 60)} / ${stage.timeLimitMinutes} min`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** C: every question, expandable for feedback. */
function Questions({ report }: { report: Report }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {report.questionResults.map((question) => (
        <li key={question.questionId}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none transition-colors duration-150 hover:bg-foreground/[0.02] focus-visible:bg-foreground/[0.035] [&::-webkit-details-marker]:hidden">
              <span className="w-6 shrink-0 text-xs text-faint tabular-nums">{question.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{question.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{typeLabel(question)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{question.status === "completed" ? "Completed" : "Not attempted"}</span>
                </span>
              </span>
              <span className="hidden sm:block">
                <DifficultyBadge difficulty={question.difficulty} />
              </span>
              <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                {fmt(question.awardedScore)} <span className="text-faint">/ {fmt(question.maxScore)}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <QuestionFeedback question={question} />
          </details>
        </li>
      ))}
    </ul>
  );
}

function QuestionFeedback({ question }: { question: QuestionResult }) {
  return (
    <div className="space-y-4 border-t border-border-subtle bg-surface-1/60 px-4 py-4 pl-[52px] text-[13px] leading-5">
      <p className="text-foreground/90">{question.feedback}</p>
      {question.skillsTested.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Skills evaluated">
          {question.skillsTested.map((skill) => (
            <li key={skill}>
              <SkillBadge>{skill}</SkillBadge>
            </li>
          ))}
        </ul>
      ) : null}
      {question.rubric ? (
        <table className="w-full max-w-2xl">
          <thead className="text-left text-xs text-faint">
            <tr>
              <th className="pb-1.5 font-normal">Rubric criterion</th>
              <th className="pb-1.5 text-right font-normal">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {question.rubric.map((criterion) => (
              <tr key={criterion.name} className="align-top">
                <td className="py-2 pr-4">
                  <p className="text-foreground">{criterion.name}</p>
                  {criterion.justification ? <p className="mt-0.5 text-muted-foreground">{criterion.justification}</p> : null}
                </td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">
                  {fmt(criterion.score)} / {criterion.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {question.strengths.length || question.missingConcepts.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {question.strengths.length ? (
            <div>
              <p className="text-xs text-faint">Strengths</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/90">
                {question.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {question.missingConcepts.length ? (
            <div>
              <p className="text-xs text-faint">Missing or incorrect</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/90">
                {question.missingConcepts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-faint">
        {question.hintsUsed} AI {question.hintsUsed === 1 ? "hint" : "hints"} · Time per question isn&apos;t tracked
        {question.kind === "written" && question.rubric ? " · Written answers are evaluated by AI against a fixed rubric" : ""}
      </p>
    </div>
  );
}

/** D: practical questions. */
function Coding({ report }: { report: Report }) {
  const coding = report.questionResults.filter((q) => q.kind === "practical");
  return (
    <div>
      <div className="scroll-thin overflow-x-auto rounded-lg border border-border bg-card px-4 py-2">
        <table className="w-full min-w-[36rem] text-[13px]">
          <thead className="text-left text-xs text-faint">
            <tr>
              <th className="pb-2 font-normal">Question</th>
              <th className="pb-2 text-right font-normal">Tests passed</th>
              <th className="pb-2 text-right font-normal">Runs</th>
              <th className="pb-2 text-right font-normal">Failures</th>
              <th className="pb-2 pl-4 font-normal">Run pass rate over time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {coding.map((q) => {
              const failures = q.executions ? q.executions.compileErrors + q.executions.runtimeErrors + q.executions.timeouts : 0;
              return (
                <tr key={q.questionId}>
                  <td className="py-2 pr-3 text-foreground">
                    <span className="text-faint tabular-nums">{q.number}. </span>
                    {q.title}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {q.tests ? `${q.tests.passed}/${q.tests.total} (${Math.round(q.correctnessPercent)}%)` : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">{q.executions?.runs ?? 0}</td>
                  <td className="py-2 text-right tabular-nums" title={q.executions ? `${q.executions.compileErrors} compile, ${q.executions.runtimeErrors} runtime, ${q.executions.timeouts} time/memory` : undefined}>
                    {failures}
                  </td>
                  <td className="py-2 pl-4 text-muted-foreground tabular-nums">
                    {q.executions?.passRates.length ? q.executions.passRates.slice(-6).map((rate) => `${Math.round(rate)}%`).join(" → ") : "No runs"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-faint">
        Tests passed counts every grading test; hidden tests are included in the total but never shown. Runs check the public
        examples only.
      </p>
    </div>
  );
}

/** E: AI usage and how the 20 points were calculated. */
function AiUsage({ report }: { report: Report }) {
  const ai = report.aiUsage;
  const parts = report.scoreBreakdown.aiEfficiency;
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-[13px] sm:grid-cols-4">
        {[
          ["AI hints requested", ai.totalHints],
          ["Adept hints", ai.hintsByStage.adept],
          ["Master hints", ai.hintsByStage.master],
          ["Code runs", ai.totalRuns],
        ].map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg text-foreground tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3">
        <Meter label="Progress per hint" value={parts.progressPerHint} max={parts.parts.progressPerHint} />
        <Meter label="Testing behaviour" value={parts.testingBehavior} max={parts.parts.testingBehavior} />
        <Meter label="Hint efficiency" value={parts.hintEfficiency} max={parts.parts.hintEfficiency} />
      </div>

      {ai.progress.length ? (
        <table className="w-full text-[13px]">
          <thead className="text-left text-xs text-faint">
            <tr>
              <th className="pb-2 font-normal">Question with hints</th>
              <th className="pb-2 text-right font-normal">Hints</th>
              <th className="pb-2 text-right font-normal">Before</th>
              <th className="pb-2 text-right font-normal">After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ai.progress.map((row) => (
              <tr key={row.questionId}>
                <td className="py-2 text-foreground">
                  <span className="text-faint tabular-nums">{row.number}. </span>
                  {row.title}
                </td>
                <td className="py-2 text-right tabular-nums">{row.hints}</td>
                <td className="py-2 text-right tabular-nums">{row.beforePercent === null ? "—" : `${Math.round(row.beforePercent)}%`}</td>
                <td className="py-2 text-right tabular-nums">{Math.round(row.afterPercent)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-[13px] leading-5 text-muted-foreground">
        <p className="text-foreground">How this score was calculated</p>
        {parts.neutral ? (
          <p className="mt-1">
            You didn&apos;t use AI hints, so you receive the full 20 points. Not using AI is never penalised. Novice is always
            excluded because AI isn&apos;t available there.
          </p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              Progress per hint (10): how much each hinted question improved after the first hint, as a share of what was left to
              gain. Coding uses test pass rates; written answers use the rubric score reached.
            </li>
            <li>
              Testing behaviour (5): 1-{parts.purposefulRuns} runs per Adept/Master coding question earns full credit; none, or
              many more, earns less.
            </li>
            <li>
              Hint efficiency (5): the result reached on hinted questions. Up to {parts.freeHintsPerQuestion} hints per question
              cost nothing; more hints never raise the score.
            </li>
            <li>Only Adept and Master count. Every part is an average, so the question mix doesn&apos;t change the maximum.</li>
          </ul>
        )}
      </div>
    </div>
  );
}

const SKILL_GROUPS: { status: SkillResult["status"]; title: string; icon: typeof Check; tone: string }[] = [
  { status: "demonstrated", title: "Demonstrated", icon: Check, tone: "text-primary" },
  { status: "partial", title: "Partially demonstrated", icon: Minus, tone: "text-muted-foreground" },
  { status: "not_demonstrated", title: "Not demonstrated in this assessment", icon: X, tone: "text-destructive" },
];

/** F: claimed skills against evidence. */
function Skills({ report }: { report: Report }) {
  const assessed = report.skillsVerification.filter((s) => s.status !== "not_assessed");
  const unassessed = report.skillsVerification.filter((s) => s.status === "not_assessed");
  return (
    <div className="space-y-6">
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
        {SKILL_GROUPS.map((group) => {
          const items = assessed.filter((s) => s.status === group.status);
          const Icon = group.icon;
          return (
            <div key={group.status} className="bg-card p-4">
              <p className="flex items-center gap-1.5 text-[13px] text-foreground">
                <Icon className={cn("size-3.5", group.tone)} aria-hidden="true" />
                {group.title}
              </p>
              {items.length ? (
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  {items.map((skill) => (
                    <li key={skill.skill} className="flex items-baseline justify-between gap-3">
                      <span className="text-foreground/90">
                        {skill.skill}
                        {!skill.claimed ? <span className="text-faint"> · assessed concept</span> : null}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Math.round(skill.percent ?? 0)}% · {skill.questionCount}q
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-faint">None</p>
              )}
            </div>
          );
        })}
      </div>
      <div>
        <p className="text-[13px] text-foreground">Not assessed</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Listed on your résumé but not covered by these questions. This is not a failure; there&apos;s simply no evidence either way.
        </p>
        {unassessed.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {unassessed.map((skill) => (
              <li key={skill.skill}>
                <SkillBadge>{skill.skill}</SkillBadge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-faint">Every listed skill was assessed.</p>
        )}
      </div>
    </div>
  );
}

/** G: classification and next steps. */
function Outcome({ report }: { report: Report }) {
  return (
    <div className="grid gap-8 rounded-lg border border-border bg-card p-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div>
        <p className="text-xl tracking-[-0.025em] text-foreground">{classificationLabel(report.classification)}</p>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {CLASSIFICATIONS.map((range, index) => {
            const upper = index === 0 ? 100 : CLASSIFICATIONS[index - 1].min - 1;
            return (
              <li key={range.value} className={cn(range.value === report.classification && "text-foreground")}>
                {range.min}–{upper}: {range.label}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-faint">Internal Vetted classifications, not industry certification levels.</p>
      </div>
      <div>
        <p className="text-[13px] text-foreground">Recommendations</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-5 text-foreground/90">
          {report.recommendations.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const SECTIONS = [
  ["stages", "Stage performance"],
  ["questions", "Question breakdown"],
  ["coding", "Coding performance"],
  ["ai", "AI usage analysis"],
  ["skills", "Skills verification"],
  ["outcome", "Final outcome"],
] as const;

export function ReportView({ report }: { report: Report }) {
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_10rem]">
      <nav aria-label="Report sections" className="order-last hidden xl:block">
        <ul className="sticky top-10 space-y-1 border-l border-border text-[13px]">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#section-${id}`}
                className="-ml-px block border-l border-transparent py-0.5 pl-3 text-muted-foreground transition-colors duration-150 outline-none hover:border-border-strong hover:text-foreground focus-visible:text-foreground"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-10">
        <Overall report={report} />
        <Section id="stages" title="Stage performance" description="Correctness in each stage.">
          <Stages report={report} />
        </Section>
        <Section id="questions" title="Question breakdown" description="Expand a question to see its feedback.">
          <Questions report={report} />
        </Section>
        <Section id="coding" title="Coding performance">
          <Coding report={report} />
        </Section>
        <Section id="ai" title="AI usage analysis" description={`AI efficiency: ${fmt(report.aiEfficiencyScore)} of 20 points.`}>
          <AiUsage report={report} />
        </Section>
        <Section id="skills" title="Skills verification" description="Résumé skills compared with what this assessment showed.">
          <Skills report={report} />
        </Section>
        <Section id="outcome" title="Final outcome">
          <Outcome report={report} />
        </Section>
      </div>
    </div>
  );
}
