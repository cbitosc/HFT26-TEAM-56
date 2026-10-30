"use client";

/**
 * Placeholder assessment dashboard for the marketing preview.
 * Static mock only. Swap this component for the real dashboard later.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  previewCandidate,
  previewProgress,
  previewTiers,
} from "@/components/dashboard/mock-data";

type Tier = (typeof previewTiers)[number];
type TierId = Tier["id"];

const KEYWORDS = new Set([
  "async",
  "await",
  "function",
  "const",
  "let",
  "return",
  "if",
  "while",
  "for",
  "new",
]);

function highlight(line: string) {
  const token =
    /(\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:async|await|function|const|let|return|if|while|for|new)\b)/g;

  return line.split(token).map((part, index) => {
    if (!part) return null;

    let className: string | undefined;
    if (part.startsWith("//")) className = "text-muted-foreground";
    else if (part.startsWith('"') || part.startsWith("'"))
      className = "text-foreground/75";
    else if (KEYWORDS.has(part)) className = "text-primary";

    if (!className) return <span key={index}>{part}</span>;

    return (
      <span key={index} className={className}>
        {part}
      </span>
    );
  });
}

type DashboardPreviewProps = {
  className?: string;
};

export function DashboardPreview({ className }: DashboardPreviewProps) {
  const [tierId, setTierId] = useState<TierId>("applied");
  const [swapping, setSwapping] = useState(false);
  const tier =
    previewTiers.find((item) => item.id === tierId) ?? previewTiers[1];

  function selectTier(id: TierId) {
    if (id === tierId) return;
    setSwapping(true);
    setTierId(id);
  }

  const progressWidth = `${(previewProgress.completed / previewProgress.total) * 100}%`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card transition-colors duration-300 hover:border-primary/40",
        className,
      )}
    >
      <div className="grid h-11 grid-cols-[auto_1fr] items-center gap-3 border-b border-border px-4 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-[#252d38]" />
          <span className="size-2 rounded-full bg-[#323b48]" />
          <span className="size-2 rounded-full bg-[#3e4856]" />
        </div>
        <div className="hidden h-7 items-center justify-center rounded-md border border-border bg-background px-3 text-xs text-muted-foreground sm:flex">
          app.vetted.dev/assessment
        </div>
        <p className="truncate text-right text-xs text-muted-foreground sm:hidden">
          app.vetted.dev/assessment
        </p>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[17rem_1fr]">
        <aside className="flex min-w-0 flex-col border-b border-border bg-background p-5 sm:p-6 lg:border-r lg:border-b-0">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Candidate
          </p>
          <div className="group -mx-2 mt-3 flex items-center gap-3 rounded-md border border-transparent p-2 transition-colors duration-200 hover:border-border hover:bg-card">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-xs font-medium text-primary transition-colors duration-200 group-hover:border-primary/40">
              {previewCandidate.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {previewCandidate.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {previewCandidate.role} · {previewCandidate.projects} projects
              </p>
            </div>
          </div>

          <div className="mt-7 flex items-baseline justify-between">
            <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Detected skills
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {previewCandidate.skills.length}
            </p>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
            {previewCandidate.skills.map((skill) => (
              <Badge
                key={skill}
                variant="secondary"
                className="border border-transparent bg-secondary transition-colors duration-200 hover:border-primary/40 hover:bg-elevated hover:text-primary"
              >
                {skill}
              </Badge>
            ))}
          </div>

          <div className="mt-7 lg:mt-auto lg:border-t lg:border-border lg:pt-6">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-foreground tabular-nums">
                {previewProgress.completed} of {previewProgress.total}
              </span>
            </div>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={previewProgress.completed}
              aria-valuemin={0}
              aria-valuemax={previewProgress.total}
              aria-label="Assessment progress"
            >
              <div
                className="preview-fill h-full rounded-full bg-primary"
                style={{ width: progressWidth }}
              />
            </div>
          </div>
        </aside>

        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[11px] font-medium tracking-[0.14em] text-primary uppercase">
              Assessment
            </p>
            <Badge variant="outline" className="gap-1.5">
              <span
                className="size-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              In progress
            </Badge>
          </div>

          <ol
            className="mt-5 flex items-center"
            aria-label="Assessment stages"
          >
            {previewProgress.stages.map((stage, index) => {
              const status =
                stage.state === "done"
                  ? ", complete"
                  : stage.state === "current"
                    ? ", current"
                    : "";

              return (
                <li key={stage.id} className="flex items-center">
                  <span
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      stage.state === "current"
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        stage.state === "done" && "bg-primary",
                        stage.state === "current" &&
                          "bg-primary ring-2 ring-primary/30",
                        stage.state === "upcoming" && "bg-border",
                      )}
                      aria-hidden="true"
                    />
                    {stage.label}{status ? <span className="sr-only">{status}</span> : null}
                  </span>
                  {index < previewProgress.stages.length - 1 ? (
                    <span
                      className={cn(
                        "mx-3 h-px w-6 sm:w-10",
                        stage.state === "done" ? "bg-primary/50" : "bg-border",
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div
            className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"
            role="group"
            aria-label="Assessment difficulty"
          >
            {previewTiers.map((item) => (
              <DifficultyCard
                key={item.id}
                tier={item}
                selected={item.id === tier.id}
                onSelect={() => selectTier(item.id)}
              />
            ))}
          </div>

          <ChallengePane tier={tier} animate={swapping} />
        </div>
      </div>
    </div>
  );
}

function DifficultyCard({
  tier,
  selected,
  onSelect,
}: {
  tier: Tier;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex h-full cursor-pointer flex-col rounded-lg border p-3 text-left outline-none transition-[border-color,background-color,transform] duration-200 ease-out",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
        "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
        selected
          ? "border-primary bg-secondary"
          : "border-border bg-background hover:border-primary/40 hover:bg-card",
      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cn(
            "text-[11px] font-medium tracking-[0.14em] uppercase",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        >
          {tier.label}
        </span>
        <span className="flex size-1.5" aria-hidden="true">
          <span
            className={cn(
              "size-1.5 rounded-full bg-primary transition-opacity duration-200",
              selected ? "opacity-100" : "opacity-0",
            )}
          />
        </span>
      </span>
      <span className="mt-2 text-sm font-medium tracking-[-0.02em] text-foreground">
        {tier.summary}
      </span>
      <span className="mt-1 text-xs text-muted-foreground tabular-nums">
        {tier.minutes} min
      </span>
      <span className="mt-auto flex gap-1 pt-4" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-0.5 flex-1 rounded-full transition-colors duration-200",
              index < tier.depth
                ? selected
                  ? "bg-primary"
                  : "bg-muted-foreground/70"
                : "bg-border",
            )}
          />
        ))}
      </span>
    </button>
  );
}

function ChallengePane({ tier, animate }: { tier: Tier; animate: boolean }) {
  return (
    <div key={tier.id} className={cn("mt-5", animate && "preview-swap")}>
      <p className="text-[11px] font-medium tracking-[0.14em] text-primary uppercase">
        Challenge
      </p>
      <h2 className="mt-2 text-lg font-medium tracking-[-0.03em] text-foreground">
        {tier.title}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{tier.prompt}</p>

      <div className="mt-5 overflow-hidden rounded-lg border border-border bg-background transition-colors duration-200 hover:border-primary/30">
        <div className="flex h-9 items-center justify-between border-b border-border px-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            challenge.ts
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {tier.checks} checks
          </span>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-foreground/90">
          <div className="min-h-[13.5rem]">
            {tier.lines.map((line, index) => (
              <div key={index} className="flex gap-4">
                <span className="w-4 shrink-0 text-right text-muted-foreground/70 tabular-nums select-none">
                  {index + 1}
                </span>
                <code>{highlight(line)}</code>
              </div>
            ))}
          </div>
        </pre>
      </div>
    </div>
  );
}
