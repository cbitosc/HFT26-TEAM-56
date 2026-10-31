"use client";

/**
 * Product views for the Features section. Static mocks built from the same
 * candidate and challenge as the hero dashboard and How it works story.
 */

import { useState } from "react";
import { Lock } from "lucide-react";
import { BrandMark } from "@/components/brand/wordmark";
import {
  DepthBars,
  SectionLabel,
} from "@/components/dashboard/dashboard-preview";
import {
  previewAssistant,
  previewCandidate,
  previewEvaluation,
  previewPortfolio,
  previewProjectSignals,
  previewReport,
  previewRunHistory,
  previewTierSignals,
  previewTiers,
} from "@/components/dashboard/mock-data";
import { FrameBar } from "@/components/showcase/frame-bar";
import { ProductFrame } from "@/components/showcase/product-frame";
import { TestRun } from "@/components/showcase/test-run";
import { cn } from "@/lib/utils";

const challenge =
  previewTiers.find((tier) => tier.source === "pathfinder") ?? previewTiers[1];

const totalCommits = previewPortfolio.projects.reduce(
  (sum, project) => sum + project.commits,
  0,
);

export function PortfolioScanPanel({ className }: { className?: string }) {
  const [selectedName, setSelectedName] = useState<string>(
    previewPortfolio.focus.name,
  );
  const selected =
    previewProjectSignals.find((project) => project.name === selectedName) ??
    previewProjectSignals[0];
  const summary = previewPortfolio.projects.find(
    (project) => project.name === selected.name,
  );

  return (
    <ProductFrame className={cn("@container", className)}>
      <FrameBar
        path={["portfolio", "leila-okonkwo", "scan"]}
        meta={`${previewPortfolio.projects.length} repos · ${totalCommits} commits`}
      />
      <div className="grid @[720px]:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="min-w-0 border-b border-border-subtle @[720px]:border-r @[720px]:border-b-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-border-subtle px-4 py-2.5 @[480px]:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] @[640px]:px-5">
            <SectionLabel>Detected projects</SectionLabel>
            <span className="hidden @[480px]:block">
              <SectionLabel>Stack</SectionLabel>
            </span>
            <span className="text-right">
              <SectionLabel>Depth</SectionLabel>
            </span>
          </div>
          <ul className="p-1.5">
            {previewProjectSignals.map((project) => {
              const isSelected = project.name === selected.name;
              const info = previewPortfolio.projects.find(
                (item) => item.name === project.name,
              );
              return (
                <li key={project.name}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedName(project.name)}
                    className={cn(
                      "relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md px-2.5 py-2 text-left outline-none transition-colors duration-150 @[480px]:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] @[640px]:px-3.5",
                      "focus-visible:ring-2 focus-visible:ring-ring/50",
                      isSelected
                        ? "bg-foreground/[0.055]"
                        : "hover:bg-foreground/[0.025]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-2 bottom-2 left-0 w-px",
                        isSelected ? "bg-primary" : "bg-transparent",
                      )}
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate font-mono text-[12px]",
                          isSelected ? "text-foreground" : "text-foreground/75",
                        )}
                      >
                        {project.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-faint">
                        {info?.summary}
                      </span>
                    </span>
                    <span className="hidden truncate font-mono text-[11px] text-muted-foreground @[480px]:block">
                      {project.stack.join(" · ")}
                    </span>
                    <span className="flex items-center gap-2.5">
                      <span className="font-mono text-[11px] text-faint tabular-nums">
                        {project.skills.length}{" "}
                        {project.skills.length === 1 ? "skill" : "skills"}
                      </span>
                      <DepthBars depth={project.depth} selected={isSelected} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div
          key={selected.name}
          className="preview-swap min-w-0 p-4 @[640px]:p-5 @[720px]:min-h-[25.5rem]"
          aria-live="polite"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[14px] text-foreground">
              {selected.name}
            </p>
            <p className="font-mono text-[11px] text-faint tabular-nums">
              {summary?.commits} commits
            </p>
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {summary?.summary}
          </p>

          <div className="mt-5">
            <SectionLabel>Stack</SectionLabel>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {selected.stack.map((tech) => (
                <li
                  key={tech}
                  className="rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground/80"
                >
                  {tech}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <SectionLabel>Skills and evidence</SectionLabel>
            <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
              {selected.skills.map((skill) => (
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
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 border-t border-border-subtle px-4 py-3 @[640px]:px-5">
        <SectionLabel>Across the portfolio</SectionLabel>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px]">
          {previewCandidate.skills.map((skill) => (
            <li key={skill.name} className="text-foreground/80">
              {skill.name}{" "}
              <span className="text-faint tabular-nums">{skill.projects}</span>
            </li>
          ))}
        </ul>
      </div>
    </ProductFrame>
  );
}

export function EvaluationPanel({ className }: { className?: string }) {
  const digest = previewReport.determinism.find(
    (row) => row.label === "Digest",
  )?.value;

  return (
    <ProductFrame className={cn("@container", className)}>
      <FrameBar
        path={["runner", challenge.file]}
        meta={`${previewReport.run} · ${previewReport.finished}`}
      />
      <dl className="space-y-0.5 border-b border-border-subtle bg-background/60 px-4 py-3 font-mono text-[11.5px] leading-5 @[640px]:px-5">
        {previewEvaluation.log.map((line) => (
          <div key={line.tag} className="flex gap-3">
            <dt className="w-16 shrink-0 text-faint">{line.tag}</dt>
            <dd className="min-w-0 truncate text-foreground/80">{line.text}</dd>
          </div>
        ))}
      </dl>

      <div className="grid @[720px]:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-3 border-b border-border-subtle p-4 @[640px]:p-5 @[720px]:border-r @[720px]:border-b-0">
          <TestRun emphasis title="Checks" checks={challenge.checks} />
          <div className="rounded-lg border border-border-subtle px-3 py-2.5">
            <SectionLabel>Finding · unreachable goal returns null</SectionLabel>
            <p className="mt-1 text-[12.5px] leading-5 text-foreground/80">
              {previewReport.finding}
            </p>
          </div>
        </div>

        <div className="min-w-0 p-4 @[640px]:p-5">
          <SectionLabel>Score</SectionLabel>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[44px] leading-none font-medium tracking-[-0.04em] text-foreground tabular-nums">
              {previewReport.score}
            </span>
            <span className="text-[13px] text-faint">/ 100</span>
          </p>

          <div className="mt-6">
            <SectionLabel>Replays of this submission</SectionLabel>
            <table className="mt-2 w-full border-y border-border-subtle font-mono text-[11px]">
              <thead className="sr-only">
                <tr>
                  <th>Replay</th>
                  <th>Score</th>
                  <th>Wall time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {previewEvaluation.replays.map((replay) => (
                  <tr key={replay.id}>
                    <td className="py-1.5 text-muted-foreground">
                      {replay.label}
                    </td>
                    <td className="py-1.5 text-foreground tabular-nums">
                      {replay.score}
                    </td>
                    <td className="py-1.5 text-right text-faint tabular-nums">
                      {replay.ms} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-foreground">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-primary"
              />
              {previewReport.determinism[0].value}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-4 text-faint">
              {digest}
              <br />
              timings vary, results don&apos;t
            </p>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}

const TIER_STATE = {
  passed: { label: "passed", className: "text-primary" },
  "in-progress": { label: "current", className: "text-foreground" },
  "not-started": { label: "locked", className: "text-faint" },
} as const;

export function DifficultyLadder() {
  return (
    <div>
      <ol className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
        {previewTiers.map((tier) => {
          const current = tier.status === "in-progress";
          const state = TIER_STATE[tier.status];
          return (
            <li
              key={tier.id}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3.5 py-3",
                current && "bg-foreground/[0.035]",
              )}
            >
              <DepthBars depth={tier.depth} selected={current} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="text-foreground">{tier.label}</span>
                  <span className="truncate text-faint">{tier.summary}</span>
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">
                  {tier.source} / {previewTierSignals[tier.id]}
                </span>
              </span>
              <span
                className={cn("font-mono text-[11px] tabular-nums", state.className)}
              >
                {state.label}
              </span>
            </li>
          );
        })}
      </ol>
      <dl className="mt-5 divide-y divide-border-subtle border-y border-border-subtle text-[12px]">
        {[
          ["Starting tier", "Depth of the topic in the candidate's code"],
          ["Next tier", "Result of the previous task"],
          ["Time budget", "Scaled to the tier, 25 to 55 min"],
        ].map(([term, detail]) => (
          <div
            key={term}
            className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2"
          >
            <dt className="text-faint">{term}</dt>
            <dd className="text-foreground/80">{detail}</dd>
          </div>
        ))}
      </dl>
      <p className="type-annotation mt-3 flex gap-2 text-faint">
        <span aria-hidden="true">↳</span>
        Novice passed 5 of 5 in 18 min · next task raised to Adept
      </p>
    </div>
  );
}

const ROLE_LABEL = {
  you: "you",
  hint: "hint",
  guard: "guard",
} as const;

/** The Vetted AI sidebar's conversation, as the product draws it. */
export function AssistantTranscript() {
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
      <div className="flex h-10 items-center gap-2 border-b border-border-subtle px-3">
        <BrandMark className="size-5 rounded-[5px]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] leading-4 font-medium text-foreground">
            Vetted AI
          </span>
          <span className="block truncate text-[11px] leading-4 text-muted-foreground">
            Helping with Question 6
          </span>
        </span>
        <span className="shrink-0 font-mono text-[11px] text-faint tabular-nums">
          {previewAssistant.used} of {previewAssistant.limit} hints
        </span>
      </div>
      <ol className="space-y-3 p-3 text-[12.5px] leading-5">
        {previewAssistant.messages.map((message, index) =>
          message.role === "you" ? (
            <li key={index} className="flex justify-end">
              <p className="max-w-[88%] rounded-lg bg-surface-2 px-2.5 py-1.5 text-foreground">
                <span className="sr-only">{ROLE_LABEL[message.role]}: </span>
                {message.text}
              </p>
            </li>
          ) : (
            <li key={index}>
              <p className="flex items-center gap-1.5 text-[11px] text-faint">
                <BrandMark className="size-3.5 rounded-[3px]" />
                Vetted AI
                {message.role === "guard" ? (
                  <span className="text-faint">· {ROLE_LABEL[message.role]}</span>
                ) : null}
              </p>
              <p
                className={cn(
                  "mt-1",
                  message.role === "guard"
                    ? "flex gap-1.5 text-muted-foreground"
                    : "text-foreground/85",
                )}
              >
                {message.role === "guard" ? (
                  <Lock className="mt-1 size-3 shrink-0" aria-hidden="true" />
                ) : null}
                {message.text}
              </p>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

export function RunAnalytics() {
  const total = challenge.checks.length;

  return (
    <div className="@container overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
      <div className="flex h-8 items-center justify-between gap-3 border-b border-border-subtle px-3 font-mono text-[11px] text-faint">
        <span className="truncate">{challenge.file}</span>
        <span className="shrink-0 tabular-nums">
          {previewRunHistory.length} runs · {challenge.minutes} min budget
        </span>
      </div>
      <ol className="space-y-2 p-3">
        {previewRunHistory.map((run, index) => {
          const latest = index === previewRunHistory.length - 1;
          return (
            <li
              key={run.id}
              className="grid grid-cols-[3rem_minmax(0,1fr)_2.5rem] items-center gap-3 font-mono text-[11px]"
            >
              <span className={latest ? "text-foreground" : "text-faint"}>
                {run.label}
              </span>
              <span
                aria-hidden="true"
                className="block h-[5px] overflow-hidden rounded-full bg-foreground/[0.06]"
              >
                <span
                  className={cn(
                    "block h-full rounded-full",
                    latest ? "bg-foreground/70" : "bg-foreground/25",
                  )}
                  style={{ width: `${(run.passed / total) * 100}%` }}
                />
              </span>
              <span className="text-right text-faint tabular-nums">
                {run.passed}/{total}
                <span className="sr-only"> checks at minute {run.minute}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <dl className="grid grid-cols-1 divide-y divide-border-subtle border-t border-border-subtle @[440px]:grid-cols-3 @[440px]:divide-x @[440px]:divide-y-0">
        {previewReport.breakdown.map((row) => (
          <div key={row.label} className="min-w-0 px-3 py-2.5">
            <dt className="text-[11px] text-faint">{row.label}</dt>
            <dd className="mt-0.5 truncate font-mono text-[11px] text-foreground/85">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
