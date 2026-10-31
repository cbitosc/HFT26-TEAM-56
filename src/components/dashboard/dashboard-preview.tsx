/**
 * Static preview of the assessment workspace for the marketing page. It is
 * built from the product's own presentational pieces (stage progress,
 * difficulty badge, chips, the Vetted AI mark) so it matches the real
 * screen; the content is the landing page's mock data, never live data.
 */

import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  FileBarChart,
  LayoutDashboard,
  ListChecks,
  Lock,
  PanelRightClose,
  Play,
  Send,
  UserRound,
  ArrowUp,
} from "lucide-react";
import { BrandMark } from "@/components/brand/wordmark";
import { DifficultyBadge } from "@/components/assessment/workspace/question-details";
import { StageProgress } from "@/components/assessment/workspace/top-bar";
import { highlight } from "@/components/showcase/code-block";
import { ProductFrame } from "@/components/showcase/product-frame";
import { TestRun } from "@/components/showcase/test-run";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import type { SessionStage } from "@/lib/assessment/session";
import {
  previewAssessment,
  previewAssistant,
  previewTiers,
  type PreviewTier,
} from "@/components/dashboard/mock-data";

const tier = previewTiers.find((item) => item.source === "pathfinder") ?? previewTiers[1];

const stages = [
  { tier: "novice", label: "Novice", status: "submitted" },
  { tier: "adept", label: "Adept", status: "active" },
  { tier: "master", label: "Master", status: "locked" },
] as unknown as SessionStage[];

/** Question 6 is open; 5 is answered, 6 in progress, 7 and 8 not started. */
const questionDots = [
  { number: 5, dot: "bg-primary" },
  { number: 6, dot: "bg-primary/50", active: true },
  { number: 7, dot: "ring-1 ring-border-strong" },
  { number: 8, dot: "ring-1 ring-border-strong" },
];

type DashboardPreviewProps = {
  className?: string;
};

export function DashboardPreview({ className }: DashboardPreviewProps) {
  return (
    <ProductFrame className={cn("@container", className)}>
      <div
        role="group"
        aria-label="Preview of the Vetted assessment workspace"
        className="grid min-w-0 @[1000px]:grid-cols-[44px_minmax(0,1fr)_17.5rem]"
      >
        <Rail />
        <div className="flex min-w-0 flex-col">
          <TopBar />
          <Toolbar />
          <div className="grid min-w-0 @[640px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <QuestionPanel tier={tier} />
            <AnswerPanel tier={tier} />
          </div>
        </div>
        <AssistantPane />
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
              : "bg-foreground/[0.08]",
          )}
          style={{ height: `${height * 100}%` }}
        />
      ))}
    </span>
  );
}

/** The navigation sidebar, collapsed to icons as it is during an assessment. */
function Rail() {
  return (
    <div
      aria-hidden="true"
      className="on-sidebar m-1.5 mr-0 hidden flex-col items-center gap-1 rounded-lg py-2.5 @[1000px]:flex"
    >
      <BrandMark className="mb-2.5 size-6" />
      {[LayoutDashboard, ListChecks, FileBarChart, UserRound].map((Icon, index) => (
        <span key={index} className="flex size-7 items-center justify-center rounded-md text-faint">
          <Icon className="size-3.5" />
        </span>
      ))}
    </div>
  );
}

function TopBar() {
  return (
    <div className="flex h-11 items-center gap-4 border-b border-border px-4">
      <p className="flex min-w-0 items-baseline gap-2 text-[13px]">
        <span className="font-medium whitespace-nowrap text-foreground">Adept — Medium</span>
        <span className="truncate text-muted-foreground tabular-nums">Question 2 of 4</span>
      </p>
      <StageProgress stages={stages} className="ml-auto hidden text-[11.5px] @[760px]:flex" />
      <p className="ml-auto flex shrink-0 items-baseline gap-3 text-[11.5px] @[760px]:ml-0">
        <span className="text-muted-foreground">
          Stage <span className="font-mono text-[12.5px] text-foreground tabular-nums">14:12</span>
        </span>
        <span aria-hidden="true" className="h-3.5 w-px self-center bg-border" />
        <span className="hidden text-muted-foreground @[480px]:inline">
          Total <span className="font-mono text-[12.5px] tabular-nums">41:30</span>
        </span>
      </p>
    </div>
  );
}

function Toolbar() {
  return (
    <div className="flex h-10 items-center gap-3 border-b border-border px-2.5">
      <ol aria-label="Questions in this stage" className="flex items-center gap-0.5">
        {questionDots.map((item) => (
          <li
            key={item.number}
            className={cn(
              "relative flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-[12px] tabular-nums",
              item.active ? "bg-foreground/[0.07] font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {item.number}
            <span aria-hidden="true" className={cn("absolute bottom-0.5 size-1 rounded-full", item.dot)} />
          </li>
        ))}
      </ol>
      <p className="hidden text-[11.5px] text-muted-foreground tabular-nums @[560px]:block">1 of 4 answered</p>
      <div aria-hidden="true" className="ml-auto flex items-center gap-1 text-[12px]">
        <span className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground @[1000px]:inline-flex">
          <BrandMark className="size-3.5 rounded-[3px]" />
          Vetted AI
        </span>
        <span className="flex size-6 items-center justify-center text-muted-foreground">
          <ChevronLeft className="size-3.5" />
        </span>
        <span className="flex size-6 items-center justify-center text-muted-foreground">
          <ChevronRight className="size-3.5" />
        </span>
        <span className="ml-1 rounded-md border border-border px-2.5 py-1 font-medium whitespace-nowrap text-foreground">
          Submit stage
        </span>
      </div>
    </div>
  );
}

function QuestionPanel({ tier }: { tier: PreviewTier }) {
  return (
    <div className="min-w-0 px-5 py-5">
      <p className="text-[11.5px] text-muted-foreground tabular-nums">Question 6 · Adept stage</p>
      <p className="mt-1 text-[16px] leading-snug font-medium tracking-[-0.02em] text-foreground">{tier.title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <DifficultyBadge difficulty="medium" />
        <span className="inline-flex h-6 items-center rounded-md border border-border px-2 text-xs">Coding · TypeScript</span>
      </div>
      <p className="mt-4 max-w-[46ch] text-[13px] leading-5 text-foreground/80">{tier.prompt}</p>

      <p className="mt-5 text-[12px] font-medium text-foreground">Requirements</p>
      <ul className="mt-1.5 space-y-1 text-[12px] leading-5 text-muted-foreground">
        {previewAssessment.requirements.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-border-strong" />
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[12px] font-medium text-foreground">Skills tested</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {["Graph search", "Binary heap", "TypeScript"].map((skill) => (
          <li key={skill}>
            <Chip>{skill}</Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnswerPanel({ tier }: { tier: PreviewTier }) {
  return (
    <div className="flex min-w-0 flex-col border-t border-border @[640px]:border-t-0 @[640px]:border-l">
      <div className="flex h-9 items-stretch justify-between gap-3 border-b border-border bg-surface-2/50 pr-3">
        <p className="-mb-px flex items-center gap-2 border-r border-b border-r-border border-b-transparent bg-background px-3.5 text-[11.5px]">
          <span className="font-mono text-foreground">{tier.file}</span>
          <span className="text-faint">TypeScript</span>
        </p>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Check className="size-3" aria-hidden="true" />
          Saved
        </span>
      </div>

      <pre
        aria-label={`${tier.file} source`}
        className="overflow-x-auto bg-background py-3 font-mono text-[12px] leading-5 text-foreground/90 [scrollbar-width:thin]"
      >
        <code className="block min-w-fit">
          {tier.lines.map((line, index) => {
            const number = index + 1;
            const active = number === tier.caretLine;
            return (
              <span key={index} className={cn("flex gap-4 pr-4 pl-3", active && "bg-foreground/[0.03]")}>
                <span
                  aria-hidden="true"
                  className={cn("w-5 shrink-0 text-right tabular-nums select-none", active ? "text-muted-foreground" : "text-faint/60")}
                >
                  {number}
                </span>
                <span className="whitespace-pre">
                  {highlight(line)}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="ml-px inline-block h-[1.05em] w-[1.5px] translate-y-[0.2em] bg-primary"
                    />
                  ) : null}
                </span>
              </span>
            );
          })}
        </code>
      </pre>

      <div className="border-t border-border">
        <p className="flex h-8 items-center gap-2 bg-surface-2/50 px-3.5 text-[11.5px] font-medium text-muted-foreground">
          <ChevronRight className="size-3 rotate-90" aria-hidden="true" />
          Console & test results
        </p>
        <div className="border-t border-border-subtle p-3">
          <TestRun emphasis title="Last run" checks={tier.checks} className="rounded-md" />
        </div>
      </div>

      <div aria-hidden="true" className="mt-auto flex items-center justify-end gap-2 border-t border-border px-3.5 py-2 text-[12px]">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-medium text-foreground">
          <Play className="size-3" />
          Run Code
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 font-medium text-background">
          <Send className="size-3" />
          Submit Solution
        </span>
      </div>
    </div>
  );
}

/** The Vetted AI sidebar, as docked beside the workspace. */
function AssistantPane() {
  return (
    <div className="hidden min-w-0 flex-col border-l border-border bg-background/40 @[1000px]:flex">
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        <BrandMark className="size-6" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-4 font-medium text-foreground">Vetted AI</p>
          <p className="truncate text-[11px] leading-4 text-muted-foreground">Helping with Question 6</p>
        </div>
        <PanelRightClose className="size-3.5 text-faint" aria-hidden="true" />
      </div>

      <ol className="flex-1 space-y-3.5 px-3 py-3.5 text-[12px] leading-5" aria-label="Conversation">
        {previewAssistant.messages.map((message, index) =>
          message.role === "you" ? (
            <li key={index} className="flex justify-end">
              <p className="max-w-[90%] rounded-lg bg-surface-2 px-2.5 py-1.5 text-foreground">{message.text}</p>
            </li>
          ) : (
            <li key={index}>
              <p className="flex items-center gap-1.5 text-[11px] text-faint">
                <BrandMark className="size-3.5 rounded-[3px]" />
                Vetted AI
              </p>
              <p
                className={cn(
                  "mt-1",
                  message.role === "guard" ? "flex gap-1.5 text-muted-foreground" : "text-foreground/85",
                )}
              >
                {message.role === "guard" ? <Lock className="mt-1 size-3 shrink-0" aria-hidden="true" /> : null}
                {message.text}
              </p>
            </li>
          ),
        )}
      </ol>

      <div aria-hidden="true" className="border-t border-border p-2.5">
        <div className="rounded-lg border border-border bg-background">
          <p className="px-2.5 pt-2 pb-5 text-[12px] text-faint">Ask about this question</p>
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[10.5px] text-faint">
              {previewAssistant.used} hints logged
            </span>
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground/80 text-background">
              <ArrowUp className="size-3" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
