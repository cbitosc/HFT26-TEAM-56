"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  AssessmentPanel,
  PortfolioPanel,
  ReportPanel,
} from "@/components/landing/how-it-works-panels";
import { SectionLight } from "@/components/landing/atmosphere";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  number: string;
  title: string;
  body: string;
  meta: string;
  Panel: ComponentType<{ active?: boolean; className?: string }>;
};

const steps: readonly Step[] = [
  {
    id: "portfolio",
    number: "01",
    title: "Understand the portfolio",
    body: "Vetted scans your repositories and records the technologies you use and the problem-solving topics you've worked on.",
    meta: "pathfinder · 5 technologies · 4 topics",
    Panel: PortfolioPanel,
  },
  {
    id: "assessment",
    number: "02",
    title: "Build the assessment",
    body: "That evidence becomes a task set in your project's domain, pitched at how deeply the topic appears in your code.",
    meta: "Adept stage · 40 min",
    Panel: AssessmentPanel,
  },
  {
    id: "report",
    number: "03",
    title: "Verify the ability",
    body: "Your solution runs against the task's checks. The report shows which passed, which failed and why, alongside the final score.",
    meta: "6 of 7 checks · score 86",
    Panel: ReportPanel,
  },
];

/** Matches the sticky navbar height (h-14). */
const STICKY_TOP = 56;
/** Scroll distance, in svh, spent on each step while the stage is pinned. */
const STEP_SCROLL = 60;

export function HowItWorksStory() {
  return (
    <>
      <StackedStory className="mt-14 story:hidden" />
      <PinnedStory className="hidden story:block" />
    </>
  );
}

/**
 * Step copy. Inside the pinned layout it sits in a button, so only phrasing
 * elements are used there; the stacked layout gets a real heading.
 */
function StepText({
  step,
  active,
  heading = false,
}: {
  step: Step;
  active: boolean;
  heading?: boolean;
}) {
  const Title = heading ? "h3" : "span";
  const Body = heading ? "p" : "span";

  return (
    <>
      <span
        className={cn(
          "block font-mono text-xs transition-colors duration-300",
          active ? "text-primary" : "text-faint",
        )}
      >
        {step.number}
      </span>
      <Title
        className={cn(
          "mt-3 block text-xl font-medium tracking-[-0.03em] transition-colors duration-300",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {step.title}
      </Title>
      <Body
        className={cn(
          "type-body mt-2 block max-w-sm transition-colors duration-300",
          active ? "text-muted-foreground" : "text-faint",
        )}
      >
        {step.body}
      </Body>
      <span className="type-annotation mt-3 block text-faint">
        {step.meta}
      </span>
    </>
  );
}

function StackedStory({ className }: { className?: string }) {
  return (
    <ol className={cn("space-y-16 sm:space-y-20", className)}>
      {steps.map((step) => (
        <li key={step.id}>
          <div className="max-w-xl">
            <StepText step={step} active heading />
          </div>
          <step.Panel className="mt-7" />
        </li>
      ))}
    </ol>
  );
}

function PinnedStory({ className }: { className?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let frame = 0;

    function measure() {
      frame = 0;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const distance = rect.height - (window.innerHeight - STICKY_TOP);
      // Hidden by the `story` breakpoint, or too short to pin.
      if (rect.height === 0 || distance <= 0) return;

      const progress = Math.min(
        Math.max((STICKY_TOP - rect.top) / distance, 0),
        1,
      );
      railRef.current?.style.setProperty("--story-progress", `${progress}`);
      setActive(
        Math.min(steps.length - 1, Math.floor(progress * steps.length)),
      );
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const distance = rect.height - (window.innerHeight - STICKY_TOP);
    const top =
      window.scrollY +
      rect.top -
      STICKY_TOP +
      distance * ((index + 0.5) / steps.length);
    window.scrollTo({ top });
  }

  return (
    <div
      ref={trackRef}
      className={cn("relative mt-6", className)}
      style={{
        height: `calc(100svh - ${STICKY_TOP}px + ${steps.length * STEP_SCROLL}svh)`,
      }}
    >
      <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] items-center">
        <SectionLight variant="stage" />
        <div className="relative grid w-full grid-cols-[minmax(0,19rem)_minmax(0,1fr)] items-center gap-14 xl:gap-20">
          <ol aria-label="Steps" className="relative">
            <span
              aria-hidden="true"
              className="absolute top-0 bottom-0 left-0 w-px bg-border"
            />
            <span
              ref={railRef}
              aria-hidden="true"
              className="absolute top-0 bottom-0 left-0 w-px origin-top scale-y-[var(--story-progress,0)] bg-foreground/50"
            />
            {steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={index === active ? "step" : undefined}
                  aria-controls={`story-panel-${step.id}`}
                  className="group relative block w-full rounded-sm py-5 pl-7 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-5 left-0 h-5 w-px transition-colors duration-300",
                      index === active ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <StepText step={step} active={index === active} />
                </button>
              </li>
            ))}
          </ol>

          <div className="grid">
            {steps.map((step, index) => {
              const shown = index === active;
              return (
                <div
                  key={step.id}
                  id={`story-panel-${step.id}`}
                  role="group"
                  aria-label={`${step.number} ${step.title}`}
                  aria-hidden={!shown}
                  inert={!shown}
                  className={cn(
                    "[grid-area:1/1] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    shown
                      ? "translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-2 opacity-0",
                  )}
                >
                  <step.Panel active={shown} className="h-full" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
