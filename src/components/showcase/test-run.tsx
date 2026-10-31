"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Circle, CircleDashed, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckState = "pass" | "fail" | "pending";

export type TestCheck = {
  name: string;
  state: CheckState;
  ms?: number;
  detail?: string;
};

type RunState = "idle" | "armed" | "running";

const STEP_MS = 90;
const START_MS = 200;

/**
 * Plays the results once. Without `play` the run starts when the list
 * scrolls into view; with `play` the caller decides when it starts.
 */
function useRun(enabled: boolean, play: boolean | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState<RunState>("idle");
  const [played, setPlayed] = useState(false);
  const controlled = play !== undefined;

  if (controlled && play && !played) setPlayed(true);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || controlled || !element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85 && rect.bottom > 0) return;

    setRun("armed");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRun("running");
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, controlled]);

  if (controlled) {
    // Reduced motion is handled in CSS: data-run styles only apply with motion.
    return { ref, run: !enabled ? "idle" : played ? "running" : "armed" };
  }

  return { ref, run };
}

function tally(checks: readonly TestCheck[]) {
  const passed = checks.filter((check) => check.state === "pass").length;
  const failed = checks.filter((check) => check.state === "fail").length;
  const ms = checks.reduce((sum, check) => sum + (check.ms ?? 0), 0);
  return { passed, failed, ran: passed + failed, ms };
}

function summarize(checks: readonly TestCheck[]) {
  const { passed, failed, ran, ms } = tally(checks);

  if (ran === 0) return `${checks.length} checks · not run yet`;

  const parts = [`${passed} passed`];
  if (failed) parts.push(`${failed} failed`);
  parts.push(`${ms} ms`);
  return parts.join(" · ");
}

function Summary({ checks }: { checks: readonly TestCheck[] }) {
  const { passed, failed, ran, ms } = tally(checks);

  if (ran === 0) return <>{summarize(checks)}</>;

  return (
    <>
      <span className="text-primary">{passed} passed</span>
      {failed ? (
        <>
          {" · "}
          <span className="text-fail">{failed} failed</span>
        </>
      ) : null}
      {` · ${ms} ms`}
    </>
  );
}

type TestRunProps = {
  checks: readonly TestCheck[];
  title?: string;
  play?: boolean;
  emphasis?: boolean;
  className?: string;
};

export function TestRun({
  checks,
  title = "Checks",
  play,
  emphasis = false,
  className,
}: TestRunProps) {
  const hasResults = checks.some((check) => check.state !== "pending");
  const { ref, run } = useRun(hasResults, play);
  const lastDelay = START_MS + checks.length * STEP_MS;

  return (
    <div
      ref={ref}
      data-run={run}
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      <div className="flex h-9 items-center justify-between gap-3 border-b border-border-subtle px-3">
        <span className="text-[12px] font-medium text-muted-foreground">
          {title}
        </span>
        <span
          className="check-meta truncate font-mono text-[11px] text-faint tabular-nums"
          style={{ "--check-delay": `${lastDelay}ms` } as CSSProperties}
        >
          {emphasis ? <Summary checks={checks} /> : summarize(checks)}
        </span>
      </div>
      <ul className="py-1.5">
        {checks.map((check, index) => (
          <li
            key={check.name}
            className={cn(
              "px-3 py-[3px]",
              emphasis && check.state === "fail" && "bg-fail/[0.07]",
            )}
            style={
              {
                "--check-delay": `${START_MS + index * STEP_MS}ms`,
              } as CSSProperties
            }
          >
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-3.5 shrink-0 items-center justify-center">
                {check.state !== "pending" ? (
                  <CircleDashed
                    aria-hidden="true"
                    className="check-pending absolute size-3 text-faint opacity-0"
                    strokeWidth={2}
                  />
                ) : null}
                <CheckGlyph state={check.state} />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono text-[11.5px]",
                  check.state === "pending"
                    ? "text-faint"
                    : emphasis && check.state === "fail"
                      ? "text-foreground"
                      : "text-foreground/85",
                )}
              >
                {check.name}
                <span className="sr-only">
                  {check.state === "pass"
                    ? ", passed"
                    : check.state === "fail"
                      ? ", failed"
                      : ", not run"}
                </span>
              </span>
              {check.ms !== undefined ? (
                <span className="check-meta shrink-0 font-mono text-[11px] text-faint tabular-nums">
                  {check.ms} ms
                </span>
              ) : null}
            </div>
            {check.detail ? (
              <p
                className={cn(
                  "check-meta mt-0.5 truncate pl-6 font-mono text-[11px]",
                  emphasis ? "text-fail" : "text-fail/80",
                )}
              >
                {check.detail}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckGlyph({ state }: { state: TestCheck["state"] }) {
  if (state === "pass") {
    return (
      <Check
        aria-hidden="true"
        className="check-result size-3.5 text-primary"
        strokeWidth={2.25}
      />
    );
  }
  if (state === "fail") {
    return (
      <X
        aria-hidden="true"
        className="check-result size-3.5 text-fail"
        strokeWidth={2.25}
      />
    );
  }
  return (
    <Circle
      aria-hidden="true"
      className="size-2.5 text-faint/70"
      strokeWidth={2}
    />
  );
}
