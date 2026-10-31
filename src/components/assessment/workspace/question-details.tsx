import type { ReactNode } from "react";
import { Chip as SkillBadge } from "@/components/ui/chip";
import { LANGUAGE_LABEL, QUESTION_TYPE_LABEL, TIER_CONFIG, type CodeLanguage, type QuestionType } from "@/lib/assessment/config";
import type { SessionQuestion } from "@/lib/assessment/session";
import { cn } from "@/lib/utils";

export function typeLabel(question: Pick<SessionQuestion, "type" | "language">) {
  const base = QUESTION_TYPE_LABEL[question.type as QuestionType] ?? question.type;
  return question.language ? `${base} · ${LANGUAGE_LABEL[question.language as CodeLanguage] ?? question.language}` : base;
}

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: "text-emerald-700 dark:text-emerald-400",
  medium: "text-amber-700 dark:text-amber-400",
  hard: "text-rose-700 dark:text-rose-400",
};

const DIFFICULTY_DOT: Record<string, string> = {
  easy: "bg-emerald-600 dark:bg-emerald-400",
  medium: "bg-amber-600 dark:bg-amber-400",
  hard: "bg-rose-600 dark:bg-rose-400",
};

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border border-border px-2 text-xs capitalize",
        DIFFICULTY_STYLE[difficulty] ?? "text-muted-foreground",
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", DIFFICULTY_DOT[difficulty] ?? "bg-foreground/40")} />
      {difficulty}
    </span>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-7" aria-labelledby={id}>
      <h2 id={id} className="text-[13px] font-medium text-foreground">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** The left panel: stage, number, title, badges, statement, examples, constraints, skills and context. */
export function QuestionDetails({ question }: { question: SessionQuestion }) {
  const stage = TIER_CONFIG[question.tier];
  return (
    <article className="mx-auto w-full max-w-[44rem]">
      <p className="text-xs text-muted-foreground tabular-nums">
        Question {question.number} <span aria-hidden="true">·</span> {stage.label} stage
      </p>
      <h1 className="mt-1.5 text-xl leading-snug font-medium tracking-[-0.02em] text-foreground">{question.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <DifficultyBadge difficulty={question.difficulty} />
        <span className="inline-flex h-6 items-center rounded-md border border-border px-2">{typeLabel(question)}</span>
        <span className="text-faint">Suggested {question.timeMinutes} min</span>
      </div>

      <div className="type-body mt-6 whitespace-pre-line text-foreground/90">{question.statement}</div>

      {question.kind === "practical" ? <PracticalDetails question={question} /> : null}

      {question.skillsTested.length ? (
        <Block id={`skills-${question.id}`} title="Skills tested">
          <ul className="flex flex-wrap gap-1.5">
            {question.skillsTested.map((skill) => (
              <li key={skill}>
                <SkillBadge>{skill}</SkillBadge>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {question.resumeEvidence.length ? (
        <Block id={`context-${question.id}`} title="From your résumé">
          <ul className="space-y-1.5 text-[13px] leading-5 text-muted-foreground">
            {question.resumeEvidence.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-border-strong" />
                {item}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </article>
  );
}

function PracticalDetails({ question }: { question: SessionQuestion }) {
  return (
    <>
      {question.entryPoint ? (
        <Block id={`requirements-${question.id}`} title="Requirements">
          <p className="text-[13px] leading-5 text-muted-foreground">
            Implement the top-level function{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-foreground">{question.entryPoint}</code>
            {question.starterFiles[0] ? (
              <>
                {" "}
                in <span className="font-mono text-xs">{question.starterFiles[0].path}</span>
              </>
            ) : null}
            , following the rules in the statement.
          </p>
        </Block>
      ) : null}

      {question.exampleTests.length ? (
        <Block id={`examples-${question.id}`} title="Examples">
          <ol className="space-y-2">
            {question.exampleTests.map((test, index) => (
              <li key={test.name} className="overflow-hidden rounded-md border border-border bg-surface-1">
                <p className="border-b border-border-subtle px-3 py-1.5 text-[11px] text-faint">Example {index + 1}</p>
                <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 px-3 py-2 font-mono text-xs leading-5">
                  <dt className="text-faint">Input</dt>
                  <dd className="overflow-x-auto text-foreground/85">{test.args.map((arg) => JSON.stringify(arg)).join(", ")}</dd>
                  <dt className="text-faint">Output</dt>
                  <dd className="overflow-x-auto text-foreground/85">
                    {test.expectThrows ? "throws an error" : JSON.stringify(test.expected)}
                  </dd>
                </dl>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}

      <Block id={`constraints-${question.id}`} title="Constraints">
        <ul className="space-y-1.5 text-[13px] leading-5 text-muted-foreground">
          {[
            "Runs in an isolated sandbox: no network, filesystem or timers.",
            "Each run stops after a few seconds; avoid unbounded loops.",
            "Run Code checks the examples. Submit Solution also runs hidden tests and is final.",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-border-strong" />
              {item}
            </li>
          ))}
        </ul>
      </Block>
    </>
  );
}
