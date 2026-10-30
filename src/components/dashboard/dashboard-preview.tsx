"use client";

/**
 * Placeholder assessment dashboard for the marketing preview.
 * Static mock only. Swap this component for the real dashboard later.
 */

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Check,
  Circle,
  CircleCheck,
  CircleDot,
  Clock,
  FileBarChart,
  FolderGit2,
  LayoutList,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/showcase/code-block";
import { ProductFrame } from "@/components/showcase/product-frame";
import { TestRun } from "@/components/showcase/test-run";
import { cn } from "@/lib/utils";
import {
  previewActivity,
  previewCandidate,
  previewStages,
  previewTiers,
  type ChallengeStatus,
  type PreviewTier,
  type TierId,
} from "@/components/dashboard/mock-data";

const STATUS_LABEL: Record<ChallengeStatus, string> = {
  passed: "Passed",
  "in-progress": "In progress",
  "not-started": "Not started",
};

const longestCode = Math.max(...previewTiers.map((tier) => tier.lines.length));

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

  return (
    <ProductFrame className={cn("@container", className)}>
      <div className="grid min-w-0 @[640px]:grid-cols-[15rem_minmax(0,1fr)] @[1000px]:grid-cols-[13rem_18rem_minmax(0,1fr)]">
        <Rail />
        <ChallengeList selectedId={tier.id} onSelect={selectTier} />
        <ChallengeDetail key={tier.id} tier={tier} animate={swapping} />
      </div>
    </ProductFrame>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-[-0.003em] text-faint">
      {children}
    </p>
  );
}

function Rail() {
  const passed = previewTiers.filter((tier) => tier.status === "passed").length;
  const total = previewTiers.length;

  return (
    <aside
      aria-label="Candidate"
      className="hidden min-w-0 flex-col border-r border-border bg-background/40 @[1000px]:flex"
    >
      <div className="flex h-11 items-center border-b border-border-subtle px-4">
        <Wordmark className="text-[14px]" />
      </div>

      <div aria-hidden="true" className="space-y-px p-2">
        <RailItem icon={LayoutList} label="Assessments" count={total} active />
        <RailItem
          icon={FolderGit2}
          label="Portfolio"
          count={previewCandidate.projects}
        />
        <RailItem icon={FileBarChart} label="Reports" count={passed} />
      </div>

      <div className="px-4 pt-4">
        <SectionLabel>Candidate</SectionLabel>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10.5px] font-medium text-muted-foreground ring-1 ring-border"
          >
            {previewCandidate.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">
              {previewCandidate.name}
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {previewCandidate.role}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-6">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Detected skills</SectionLabel>
          <span className="font-mono text-[10.5px] text-faint">projects</span>
        </div>
        <ul className="mt-2 space-y-0.5">
          {previewCandidate.skills.map((skill) => (
            <li
              key={skill.name}
              className="flex items-center justify-between py-1 font-mono text-[11.5px]"
            >
              <span className="text-foreground/85">{skill.name}</span>
              <span className="text-faint tabular-nums">{skill.projects}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto border-t border-border-subtle px-4 pt-4 pb-5">
        <div className="flex items-center justify-between text-[11.5px]">
          <span className="text-muted-foreground">Challenges passed</span>
          <span className="text-foreground tabular-nums">
            {passed} of {total}
          </span>
        </div>
        <div
          className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.06]"
          role="progressbar"
          aria-valuenow={passed}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Challenges passed"
        >
          <div
            className="preview-fill h-full rounded-full bg-primary"
            style={{ width: `${(passed / total) * 100}%` }}
          />
        </div>
      </div>
    </aside>
  );
}

function RailItem({
  icon: Icon,
  label,
  count,
  active = false,
}: {
  icon: typeof LayoutList;
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px]",
        active ? "bg-white/[0.045] text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="flex-1 truncate">{label}</span>
      <span className="font-mono text-[11px] text-faint tabular-nums">
        {count}
      </span>
    </div>
  );
}

function ChallengeList({
  selectedId,
  onSelect,
}: {
  selectedId: TierId;
  onSelect: (id: TierId) => void;
}) {
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = previewTiers.findIndex((tier) => tier.id === selectedId);
    let next = current;

    if (event.key === "ArrowDown") next = Math.min(current + 1, previewTiers.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(current - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = previewTiers.length - 1;
    else return;

    event.preventDefault();
    onSelect(previewTiers[next].id);
    optionRefs.current[next]?.focus({ preventScroll: true });
  }

  return (
    <div className="flex min-w-0 flex-col border-b border-border @[640px]:border-r @[640px]:border-b-0">
      <div className="flex h-11 items-center justify-between gap-3 border-b border-border-subtle px-4">
        <p className="truncate text-[13px] font-medium text-foreground">
          Assessment
        </p>
        <Badge
          variant="outline"
          className="h-5 gap-1.5 px-1.5 text-[11px] font-normal text-muted-foreground"
        >
          <span
            className="size-1.5 rounded-full bg-foreground/70"
            aria-hidden="true"
          />
          In progress
        </Badge>
      </div>

      <ol
        className="flex items-center border-b border-border-subtle px-4 py-3"
        aria-label="Assessment stages"
      >
        {previewStages.map((stage, index) => (
          <li key={stage.id} className="flex items-center">
            <span
              className={cn(
                "flex items-center gap-1.5 text-[11.5px]",
                stage.state === "current"
                  ? "text-foreground"
                  : stage.state === "done"
                    ? "text-muted-foreground"
                    : "text-faint",
              )}
            >
              {stage.state === "done" ? (
                <Check
                  className="size-3 text-primary"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-[3px] size-1.5 rounded-full",
                    stage.state === "current"
                      ? "bg-foreground"
                      : "ring-1 ring-faint ring-inset",
                  )}
                />
              )}
              {stage.label}
              <span className="sr-only">
                {stage.state === "done"
                  ? ", complete"
                  : stage.state === "current"
                    ? ", current"
                    : ""}
              </span>
            </span>
            {index < previewStages.length - 1 ? (
              <span
                aria-hidden="true"
                className="mx-2.5 h-px w-4 bg-border-strong"
              />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <SectionLabel>Challenges</SectionLabel>
        <span className="font-mono text-[10.5px] text-faint tabular-nums">
          {previewTiers.length}
        </span>
      </div>

      <div
        role="listbox"
        aria-label="Challenges"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        className="space-y-px px-2 pb-3"
      >
        {previewTiers.map((tier, index) => {
          const selected = tier.id === selectedId;

          return (
            <div
              key={tier.id}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tier.id)}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 outline-none transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-ring/50",
                selected
                  ? "bg-white/[0.055]"
                  : "hover:bg-white/[0.025]",
              )}
            >
              <StatusGlyph status={tier.status} />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[13px]",
                    selected ? "text-foreground" : "text-foreground/80",
                  )}
                >
                  {tier.summary}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-faint">
                  <span>{tier.label}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{tier.minutes} min</span>
                  <span className="sr-only">
                    , {STATUS_LABEL[tier.status]}
                  </span>
                </span>
              </span>
              <DepthBars depth={tier.depth} selected={selected} />
            </div>
          );
        })}
      </div>

      <div className="hidden border-t border-border-subtle px-4 pt-4 pb-5 @[640px]:block">
        <SectionLabel>Activity</SectionLabel>
        <ol className="relative mt-3 space-y-3.5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-white/[0.07]">
          {previewActivity.map((item, index) => (
            <li key={item.id} className="relative flex gap-3 pl-4">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-[6px] left-0 size-[7px] rounded-full ring-2 ring-surface-1",
                  index === 0 ? "bg-foreground/80" : "bg-white/[0.18]",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-foreground/80">
                  {item.title}
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-faint">
                  {item.meta}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-faint tabular-nums">
                {item.time}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StatusGlyph({ status }: { status: ChallengeStatus }) {
  const className = "mt-[3px] size-3.5 shrink-0";

  if (status === "passed") {
    return (
      <CircleCheck
        aria-hidden="true"
        className={cn(className, "text-primary")}
        strokeWidth={2}
      />
    );
  }
  if (status === "in-progress") {
    return (
      <CircleDot
        aria-hidden="true"
        className={cn(className, "text-foreground/80")}
        strokeWidth={2}
      />
    );
  }
  return (
    <Circle
      aria-hidden="true"
      className={cn(className, "text-faint")}
      strokeWidth={2}
    />
  );
}

export function DepthBars({
  depth,
  selected,
}: {
  depth: PreviewTier["depth"];
  selected: boolean;
}) {
  return (
    <span aria-hidden="true" className="mt-1 flex h-2.5 items-end gap-[2px]">
      {[0.45, 0.7, 1].map((height, index) => (
        <span
          key={index}
          className={cn(
            "w-[3px] rounded-[1px] transition-colors duration-150",
            index < depth
              ? selected
                ? "bg-foreground/80"
                : "bg-muted-foreground/60"
              : "bg-white/[0.08]",
          )}
          style={{ height: `${height * 100}%` }}
        />
      ))}
    </span>
  );
}

function ChallengeDetail({
  tier,
  animate,
}: {
  tier: PreviewTier;
  animate: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col", animate && "preview-swap")}>
      <div className="flex h-11 items-center justify-between gap-3 border-b border-border-subtle px-5">
        <p className="truncate font-mono text-[11.5px] text-faint">
          assessment <span aria-hidden="true">/</span>{" "}
          <span className="text-muted-foreground">
            {tier.label.toLowerCase()}
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-faint tabular-nums">
          <Clock className="size-3" strokeWidth={2} aria-hidden="true" />
          {tier.minutes} min
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-3 p-4 @[640px]:p-5">
        <div className="px-0.5">
          <p className="text-[16px] font-medium tracking-[-0.02em] text-foreground">
            {tier.title}
          </p>
          <p className="mt-1.5 max-w-[46ch] text-[13px] leading-5 text-foreground/65">
            {tier.prompt}
          </p>
          <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/25 bg-primary/[0.06] px-2 py-1 text-[11.5px] text-foreground">
            <FolderGit2
              className="size-3 shrink-0 text-primary"
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="truncate">
              Generated from your{" "}
              <span className="font-mono">{tier.source}</span> project
            </span>
          </p>
        </div>

        <CodeBlock
          filename={tier.file}
          meta="TypeScript"
          lines={tier.lines}
          caretLine={tier.caretLine}
          minLines={longestCode}
        />

        <TestRun
          emphasis
          title={tier.status === "not-started" ? "Checks" : "Last run"}
          checks={tier.checks}
        />
      </div>
    </div>
  );
}
