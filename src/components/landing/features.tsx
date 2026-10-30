import type { ReactNode } from "react";
import {
  AssistantTranscript,
  DifficultyLadder,
  EvaluationPanel,
  PortfolioScanPanel,
  RunAnalytics,
} from "@/components/landing/feature-panels";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";
import { SectionHeader } from "@/components/landing/section-header";
import { cn } from "@/lib/utils";

export function Features() {
  return (
    <Section id="features" padding="pt-16 pb-24 lg:pt-20 lg:pb-32">
      <Reveal>
        <SectionHeader
          label="Features"
          size="md"
          layout="split"
          title="What sits between your repository and the report."
          description="The parts of Vetted that make a result something a developer can stand behind and a reviewer can check."
        />
      </Reveal>

      <div className="mt-16 space-y-20 lg:mt-20 lg:space-y-28">
        <Showcase
          number="01"
          label="Portfolio intelligence"
          title="Reads the repositories, not the resume."
          body="Vetted walks each repository's source, tests and history, then records the stack it runs on and the skills the code demonstrates. Every skill points back to the file that shows it."
          facts={[
            ["Reads", "source · tests · commit history"],
            ["Skips", "forks · vendored and generated code"],
            ["Records", "stack, skills and topic depth"],
          ]}
        >
          <PortfolioScanPanel />
        </Showcase>

        <Showcase
          reverse
          number="02"
          label="Deterministic evaluation"
          title="The same submission earns the same score."
          body="Every run is pinned to a runtime, a seed and a sandbox with no network. Replay it tomorrow, or let a reviewer replay it, and each check lands the same way."
          facts={[
            ["Runtime", "node 20.11 · vitest 1.6"],
            ["Sandbox", "network off · 512 MB"],
            ["Proof", "sha256 digest per run"],
          ]}
        >
          <EvaluationPanel />
        </Showcase>
      </div>

      <Reveal className="mt-20 lg:mt-28">
        <p className="type-label flex items-center gap-3 text-muted-foreground">
          <span aria-hidden="true" className="h-px w-5 bg-border-strong" />
          Also in every assessment
        </p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto]">
          <Supporting
            className="md:col-span-2 lg:col-span-1 lg:row-span-2"
            number="03"
            title="Difficulty that follows the evidence"
            body="The first task is pitched at how deeply a topic appears in your code. Each result decides the next tier, so nobody sits a test written for someone else."
          >
            <DifficultyLadder />
          </Supporting>
          <Supporting
            number="04"
            title="Guarded AI assistance"
            body="An assistant can explain an error or a concept. It won't write the solution, and every hint is logged in the report."
          >
            <AssistantTranscript />
          </Supporting>
          <Supporting
            number="05"
            title="Performance analytics"
            body="See how a solution converged: checks passed per run, time used, and where the score was won or lost."
          >
            <RunAnalytics />
          </Supporting>
        </div>
      </Reveal>
    </Section>
  );
}

function Showcase({
  number,
  label,
  title,
  body,
  facts,
  reverse = false,
  children,
}: {
  number: string;
  label: string;
  title: string;
  body: string;
  facts: ReadonlyArray<readonly [string, string]>;
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <Reveal>
      <article
        className={cn(
          "grid gap-8 border-t border-border pt-8 lg:gap-14 lg:pt-10",
          reverse
            ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]"
            : "lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]",
        )}
      >
        <div className={cn("max-w-xl", reverse && "lg:order-2")}>
          <p className="type-label flex items-center gap-3 text-muted-foreground">
            <span className="text-faint">{number}</span>
            {label}
          </p>
          <h3 className="mt-5 text-2xl leading-[1.15] tracking-[-0.03em] text-balance sm:text-[1.75rem]">
            {title}
          </h3>
          <p className="type-body mt-3 text-muted-foreground">{body}</p>
          <dl className="mt-7 divide-y divide-border-subtle border-y border-border-subtle">
            {facts.map(([term, detail]) => (
              <div
                key={term}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-2.5"
              >
                <dt className="text-[12px] text-faint">{term}</dt>
                <dd className="font-mono text-[11.5px] text-foreground/80">
                  {detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={cn("min-w-0", reverse && "lg:order-1")}>
          {children}
        </div>
      </article>
    </Reveal>
  );
}

function Supporting({
  number,
  title,
  body,
  className,
  children,
}: {
  number: string;
  title: string;
  body: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={cn("flex min-w-0 flex-col bg-background p-6 sm:p-7", className)}
    >
      <p className="font-mono text-[11px] text-faint">{number}</p>
      <h3 className="mt-3 text-[17px] leading-snug font-medium tracking-[-0.02em]">
        {title}
      </h3>
      <p className="type-body mt-2 max-w-[46ch] text-muted-foreground">
        {body}
      </p>
      <div className="mt-6 flex-1">{children}</div>
    </article>
  );
}
