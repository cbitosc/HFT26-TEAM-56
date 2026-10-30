"use client";

/**
 * Product states shown in the How it works story. Static mocks built from
 * the same candidate and challenge as the hero dashboard.
 */

import type { ReactNode } from "react";
import { Check, Clock, FolderGit2 } from "lucide-react";
import { DepthBars, SectionLabel } from "@/components/dashboard/dashboard-preview";
import {
  previewAssessment,
  previewPortfolio,
  previewReport,
  previewTiers,
} from "@/components/dashboard/mock-data";
import { CodeBlock } from "@/components/showcase/code-block";
import { ProductFrame } from "@/components/showcase/product-frame";
import { TestRun } from "@/components/showcase/test-run";
import { cn } from "@/lib/utils";

const challenge =
  previewTiers.find((tier) => tier.source === "pathfinder") ?? previewTiers[1];

type PanelProps = {
  /** Set by the scroll story; undefined when the panel is shown statically. */
  active?: boolean;
  className?: string;
};

function PanelBar({ path, meta }: { path: string[]; meta: ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 border-b border-border-subtle px-4 @[640px]:px-5">
      <p className="truncate font-mono text-[11.5px] text-faint">
        {path.map((part, index) => (
          <span key={part}>
            {index > 0 ? <span aria-hidden="true"> / </span> : null}
            <span
              className={
                index === path.length - 1 ? "text-muted-foreground" : undefined
              }
            >
              {part}
            </span>
          </span>
        ))}
      </p>
      <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-faint tabular-nums">
        {meta}
      </span>
    </div>
  );
}

function Meter({ ratio, active = true }: { ratio: number; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="block h-[3px] overflow-hidden rounded-full bg-white/[0.06]"
    >
      <span
        className="block h-full origin-left rounded-full bg-foreground/55 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ transform: `scaleX(${active ? ratio : 0})` }}
      />
    </span>
  );
}

export function PortfolioPanel({ className }: PanelProps) {
  const { projects, focus, analysed } = previewPortfolio;

  return (
    <ProductFrame className={cn("@container", className)}>
      <PanelBar
        path={["portfolio", "leila-okonkwo"]}
        meta={`${projects.length} projects · analysed ${analysed}`}
      />
      <div className="grid @[640px]:grid-cols-[13.5rem_minmax(0,1fr)]">
        <div className="border-b border-border-subtle p-2 @[640px]:border-r @[640px]:border-b-0">
          <div className="px-2 pt-2 pb-2">
            <SectionLabel>Projects</SectionLabel>
          </div>
          <ul className="space-y-px">
            {projects.map((project) => {
              const selected = project.name === focus.name;
              return (
                <li
                  key={project.name}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5",
                    selected ? "bg-white/[0.055]" : "",
                  )}
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate font-mono text-[12px]",
                        selected ? "text-foreground" : "text-foreground/75",
                      )}
                    >
                      {project.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-faint">
                      {project.summary}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">
                    {project.commits}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="min-w-0 p-4 @[640px]:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[14px] text-foreground">{focus.name}</p>
            <p className="truncate font-mono text-[11px] text-faint">
              {focus.stats}
            </p>
          </div>
          <p className="mt-1.5 max-w-[52ch] text-[13px] leading-5 text-muted-foreground">
            {focus.description}
          </p>

          <div className="mt-5">
            <SectionLabel>Detected technologies</SectionLabel>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {focus.technologies.map((tech) => (
                <li
                  key={tech}
                  className="rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground/80"
                >
                  {tech}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 grid gap-5 @[760px]:grid-cols-2 @[760px]:gap-6">
            <div className="min-w-0">
              <SectionLabel>Identified skills</SectionLabel>
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {focus.skills.map((skill) => (
                  <li key={skill.name} className="py-2">
                    <span className="block text-[12.5px] text-foreground/90">
                      {skill.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-faint">
                      {skill.evidence}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between">
                <SectionLabel>DSA topics</SectionLabel>
                <span className="font-mono text-[10.5px] text-faint">files</span>
              </div>
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {focus.topics.map((topic) => (
                  <li
                    key={topic.name}
                    className="flex items-center gap-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/90">
                      {topic.name}
                    </span>
                    <DepthBars depth={topic.depth} selected={topic.depth === 3} />
                    <span className="w-4 text-right font-mono text-[11px] text-faint tabular-nums">
                      {topic.files}
                    </span>
                    <span className="sr-only">
                      , depth {topic.depth} of 3, found in {topic.files} files
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}

export function AssessmentPanel({ className }: PanelProps) {
  return (
    <ProductFrame className={cn("@container", className)}>
      <PanelBar
        path={["assessment", challenge.label.toLowerCase()]}
        meta={
          <>
            <Clock className="size-3" strokeWidth={2} aria-hidden="true" />
            {challenge.minutes} min
          </>
        }
      />
      <div className="flex min-w-0 flex-col gap-4 p-4 @[640px]:p-5">
        <div className="flex flex-col gap-1 rounded-md border border-primary/25 bg-primary/[0.06] px-3 py-2.5 @[640px]:flex-row @[640px]:items-center @[640px]:justify-between @[640px]:gap-4">
          <p className="flex items-center gap-1.5 text-[12.5px] text-foreground">
            <FolderGit2
              className="size-3.5 shrink-0 text-primary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>
              Generated from your{" "}
              <span className="font-mono">{challenge.source}</span> project
            </span>
          </p>
          <p className="truncate pl-5 font-mono text-[11px] text-faint @[640px]:pl-0">
            {previewAssessment.evidence.join(" · ")}
          </p>
        </div>

        <div className="grid gap-4 @[640px]:grid-cols-[minmax(0,1fr)_15rem] @[640px]:gap-6">
          <div className="min-w-0">
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
            <p className="mt-2.5 text-[15px] font-medium tracking-[-0.02em] text-foreground">
              {challenge.title}
            </p>
            <p className="mt-1.5 max-w-[46ch] text-[13px] leading-5 text-muted-foreground">
              {challenge.prompt}
            </p>
          </div>
          <div className="min-w-0">
            <SectionLabel>Requirements</SectionLabel>
            <ul className="mt-2 space-y-1.5">
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
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <CodeBlock
            filename={challenge.file}
            meta="TypeScript"
            lines={challenge.lines}
            caretLine={challenge.caretLine}
          />
          <div className="flex items-center justify-between gap-3 text-[11.5px]">
            <span className="font-mono text-faint">autosaved 12s ago</span>
            <span
              aria-hidden="true"
              className="rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-[12px] text-foreground"
            >
              Run tests
            </span>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}

export function ReportPanel({ active, className }: PanelProps) {
  const shown = active ?? true;
  const { score, breakdown, determinism, finding } = previewReport;

  return (
    <ProductFrame className={cn("@container", className)}>
      <PanelBar
        path={["report", challenge.file]}
        meta={`${previewReport.run} · ${previewReport.finished}`}
      />
      <div className="grid @[720px]:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-border-subtle p-4 @[640px]:p-5 @[720px]:border-r @[720px]:border-b-0">
          <SectionLabel>Final score</SectionLabel>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[44px] leading-none font-medium tracking-[-0.04em] text-foreground tabular-nums">
              {score}
            </span>
            <span className="text-[13px] text-faint">/ 100</span>
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {challenge.label} · {challenge.title}
          </p>

          <dl className="mt-5 space-y-3">
            {breakdown.map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <dt className="text-foreground/85">{row.label}</dt>
                  <dd className="font-mono text-[11px] text-faint tabular-nums">
                    {row.value}
                  </dd>
                </div>
                <div className="mt-1.5">
                  <Meter ratio={row.ratio} active={shown} />
                </div>
              </div>
            ))}
          </dl>

          <div className="mt-5 border-t border-border-subtle pt-4">
            <p className="flex items-center gap-1.5 text-[12px] text-foreground">
              <Check
                className="size-3.5 text-primary"
                strokeWidth={2.25}
                aria-hidden="true"
              />
              Deterministic evaluation
            </p>
            <dl className="mt-2.5 space-y-1">
              {determinism.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-3 text-[11.5px]"
                >
                  <dt className="text-faint">{row.label}</dt>
                  <dd className="truncate font-mono text-[11px] text-muted-foreground">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 p-4 @[640px]:p-5">
          <TestRun title="Checks" checks={challenge.checks} play={active} />
          <div className="rounded-lg border border-border-subtle px-3 py-2.5">
            <SectionLabel>Finding</SectionLabel>
            <p className="mt-1 text-[12.5px] leading-5 text-foreground/80">
              {finding}
            </p>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}
