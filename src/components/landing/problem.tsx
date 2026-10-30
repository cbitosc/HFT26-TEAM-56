import type { ReactNode } from "react";
import {
  DepthBars,
  SectionLabel,
} from "@/components/dashboard/dashboard-preview";
import {
  previewAssessment,
  previewCandidate,
  previewPortfolio,
  previewReport,
  previewTiers,
  previewTraditional,
} from "@/components/dashboard/mock-data";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";
import { SectionHeader } from "@/components/landing/section-header";
import { CodeBlock } from "@/components/showcase/code-block";
import { FrameBar } from "@/components/showcase/frame-bar";
import { ProductFrame } from "@/components/showcase/product-frame";
import { TestRun } from "@/components/showcase/test-run";
import { cn } from "@/lib/utils";

const challenge =
  previewTiers.find((tier) => tier.source === "pathfinder") ?? previewTiers[1];

/*
 * Both columns share one grid from `lg` up: a caption row, the frame bar and
 * four stage rows. Subgrid keeps each stage level across the two frames, so
 * the frames can't be `@container`: containment breaks subgrid.
 */
const column = "min-w-0 lg:row-span-6 lg:grid lg:grid-rows-subgrid";
const frameRows = "lg:row-span-5 lg:grid lg:grid-rows-subgrid";

export function Problem() {
  return (
    <Section padding="pt-10 pb-24 sm:pt-14 lg:pt-16 lg:pb-28">
      <Reveal>
        <SectionHeader
          label="The problem"
          size="md"
          title="Hiring screens test recall, not the work you've built."
          description="A timed puzzle measures how recently you practised. A resume lists tools. Neither shows how you actually design, debug and ship code."
        />
      </Reveal>
      <Reveal className="mt-14">
        <div className="grid gap-y-12 lg:grid-cols-2 lg:grid-rows-[repeat(6,auto)] lg:gap-x-5 lg:gap-y-0">
          <Traditional />
          <Vetted />
        </div>
      </Reveal>
    </Section>
  );
}

function Caption({
  label,
  note,
  strong = false,
}: {
  label: string;
  note: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-4">
      <h3
        className={cn(
          "type-label",
          strong ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </h3>
      <p className="type-annotation text-faint">{note}</p>
    </div>
  );
}

function Stage({
  index,
  label,
  note,
  children,
}: {
  index: string;
  label: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col border-border-subtle p-4 not-last:border-b sm:p-5">
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-[11px] text-faint tabular-nums">
          {index}
        </span>
        <SectionLabel>{label}</SectionLabel>
      </div>
      <div className="mt-3 min-w-0 flex-1">{children}</div>
      <p className="type-annotation mt-4 flex gap-2 text-faint">
        <span aria-hidden="true">↳</span>
        {note}
      </p>
    </div>
  );
}

function Traditional() {
  const t = previewTraditional;
  const passed = t.cases.filter((result) => result === "pass").length;

  return (
    <div className={column}>
      <Caption label="Traditional screen" note="same for every candidate" />
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-background text-[13px] leading-5",
          frameRows,
        )}
      >
        <FrameBar className="sm:px-5" path={t.path} meta={t.timer} />

        <Stage
          index="01"
          label="Source"
          note={`served to ${t.candidates.toLocaleString("en-US")} candidates this cycle`}
        >
          <p className="truncate font-mono text-[12px] text-foreground/70">
            {t.bank}
          </p>
          <p className="mt-1 text-[12.5px] text-faint">
            Drawn at random from {t.pool} shared questions.
          </p>
        </Stage>

        <Stage
          index="02"
          label="Candidate context"
          note="resume and repositories are never opened"
        >
          <dl className="space-y-1.5">
            {["Projects", "Technologies", "Skills"].map((field) => (
              <div key={field} className="flex items-center gap-3">
                <dt className="w-24 shrink-0 text-[12px] text-faint">
                  {field}
                </dt>
                <dd className="flex h-6 flex-1 items-center rounded-[5px] border border-dashed border-border-strong px-2 font-mono text-[11px] text-faint/70">
                  not read
                </dd>
              </div>
            ))}
          </dl>
        </Stage>

        <Stage
          index="03"
          label="Task"
          note="unrelated to anything the candidate has built"
        >
          <p className="text-[14px] font-medium tracking-[-0.02em] text-foreground/75">
            {t.title}
          </p>
          <p className="mt-1 max-w-[46ch] text-[12.5px] text-faint">
            {t.prompt}
          </p>
          <CodeBlock
            className="mt-3 opacity-80"
            filename={t.file}
            meta="any language"
            lines={t.lines}
          />
        </Stage>

        <Stage index="04" label="Result" note="a verdict with nothing to act on">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] text-foreground/75">{t.verdict}</p>
            <p className="font-mono text-[11px] text-faint tabular-nums">
              {passed} of {t.cases.length} hidden cases
            </p>
          </div>
          <ol
            aria-label="Hidden test cases"
            className="mt-3 grid grid-cols-6 gap-1 sm:grid-cols-12"
          >
            {t.cases.map((result, index) => (
              <li
                key={index}
                className={cn(
                  "h-5 rounded-[3px]",
                  result === "pass" ? "bg-white/[0.07]" : "bg-fail/35",
                )}
              >
                <span className="sr-only">
                  Case {index + 1}, {result === "pass" ? "passed" : "failed"}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-faint">
            Inputs are hidden and no reason is given for the failures.
          </p>
        </Stage>
      </div>
    </div>
  );
}

function Vetted() {
  const { focus } = previewPortfolio;
  const project = previewPortfolio.projects.find(
    (item) => item.name === focus.name,
  );
  const digest = previewReport.determinism.find(
    (row) => row.label === "Digest",
  )?.value;
  const environment = previewReport.determinism.find(
    (row) => row.label === "Environment",
  )?.value;

  return (
    <div className={column}>
      <Caption
        strong
        label="Vetted assessment"
        note={`built from ${previewCandidate.name.split(" ")[0]}'s ${focus.name} repository`}
      />
      <ProductFrame className={frameRows}>
        <FrameBar
          className="sm:px-5"
          path={["assessment", challenge.label.toLowerCase()]}
          meta={`${challenge.minutes} min`}
        />

        <Stage
          index="01"
          label="Source"
          note={`read from ${project?.commits ?? 0} commits · ${focus.stats.split(" · ")[0]}`}
        >
          <p className="truncate font-mono text-[12px] text-foreground">
            {previewCandidate.name.toLowerCase().replace(" ", "-")} /{" "}
            {focus.name}
          </p>
          <p className="mt-1 max-w-[52ch] text-[12.5px] text-muted-foreground">
            {focus.description}
          </p>
        </Stage>

        <Stage
          index="02"
          label="Candidate context"
          note="each skill cites the file it came from"
        >
          <ul aria-label="Detected technologies" className="flex flex-wrap gap-1.5">
            {focus.technologies.map((tech) => (
              <li
                key={tech}
                className="rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground/80"
              >
                {tech}
              </li>
            ))}
          </ul>
          <ul
            aria-label="Identified skills"
            className="mt-3 divide-y divide-border-subtle border-y border-border-subtle"
          >
            {focus.skills.map((skill) => (
              <li
                key={skill.name}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span className="shrink-0 text-[12.5px] text-foreground/90">
                  {skill.name}
                </span>
                <span className="truncate font-mono text-[11px] text-faint">
                  {skill.evidence}
                </span>
              </li>
            ))}
          </ul>
        </Stage>

        <Stage
          index="03"
          label="Task"
          note={`evidence: ${previewAssessment.evidence.join(" · ")}`}
        >
          <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <DepthBars depth={challenge.depth} selected />
            {challenge.label}
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span className="text-faint tabular-nums">
              Tier {challenge.depth} of 3
            </span>
          </p>
          <p className="mt-2 text-[14px] font-medium tracking-[-0.02em] text-foreground">
            {challenge.title}
          </p>
          <p className="mt-1 max-w-[46ch] text-[12.5px] text-muted-foreground">
            {challenge.prompt}
          </p>
          <ul className="mt-3 space-y-1">
            {previewAssessment.requirements.map((item) => (
              <li
                key={item}
                className="flex gap-2 text-[12px] leading-[18px] text-foreground/80"
              >
                <span
                  aria-hidden="true"
                  className="mt-[7px] size-1 shrink-0 rounded-full bg-faint"
                />
                {item}
              </li>
            ))}
          </ul>
        </Stage>

        <Stage
          index="04"
          label="Result"
          note={`${digest} · ${environment}`}
        >
          <TestRun emphasis title="Checks" checks={challenge.checks} />
          <p className="mt-3 flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-muted-foreground">
              Score{" "}
              <span className="text-foreground tabular-nums">
                {previewReport.score}
              </span>{" "}
              / 100
            </span>
            <span className="font-mono text-[11px] text-faint">
              runs {previewReport.determinism[0].value}
            </span>
          </p>
        </Stage>
      </ProductFrame>
    </div>
  );
}
