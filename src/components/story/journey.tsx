"use client";

import { useEffect, useRef, useState } from "react";
import { SCORE } from "@/components/story/journey-shapes";
import {
  JOURNEY_SCROLL,
  pinnedForStep,
  STICKY_TOP,
} from "@/components/story/journey-timing";
import { StackedStory } from "@/components/story/stacked-story";
import { storySteps } from "@/components/story/story-steps";
import { Container } from "@/components/landing/container";
import { scrollToTop } from "@/components/landing/smooth-scroll";
import { cn } from "@/lib/utils";

/**
 * How it works as a pinned 3D scroll journey. The particle scene loads only
 * when the section approaches; if WebGL is unavailable the stacked story
 * renders instead.
 */
export function Journey({ className }: { className?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(-1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    const canvas = canvasRef.current;
    if (!track || !canvas) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        import("@/components/story/journey-scene")
          .then(({ createJourney }) => {
            if (cancelled) return;
            dispose = createJourney({
              track,
              canvas,
              hero: document.querySelector<HTMLElement>("[data-hero-handoff]"),
              copy: copyRef.current,
              onStep: setStep,
              onProgress: (value) =>
                progressRef.current?.style.setProperty(
                  "--journey-progress",
                  value.toFixed(4),
                ),
              onScore: (value) => {
                if (scoreRef.current) scoreRef.current.textContent = `${value}`;
              },
            });
          })
          .catch(() => {
            if (!cancelled) setFailed(true);
          });
      },
      { rootMargin: "100% 0px" },
    );

    observer.observe(track);
    return () => {
      cancelled = true;
      observer.disconnect();
      dispose?.();
    };
  }, []);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const distance = rect.height - (window.innerHeight - STICKY_TOP);
    const top =
      window.scrollY + rect.top - STICKY_TOP + distance * pinnedForStep(index);
    scrollToTop(top);
  }

  if (failed) {
    return (
      <Container className={cn("pt-24 pb-24 lg:pt-28", className)}>
        <StackedStory />
      </Container>
    );
  }

  return (
    <div
      ref={trackRef}
      className={cn("relative", className)}
      style={{
        height: `calc(100svh - ${STICKY_TOP}px + ${JOURNEY_SCROLL}svh)`,
      }}
    >
      <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-hidden">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 size-full"
        />

        {/* Keeps the copy readable where the shape passes behind it on small screens. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-background via-background/80 to-transparent lg:hidden"
        />

        <Container className="relative flex h-full flex-col justify-end pb-10 lg:justify-center lg:pb-0">
          <div ref={copyRef} className="max-w-[34rem] lg:max-w-[30rem]">
            <p className="type-label flex items-center gap-3 text-muted-foreground">
              <span aria-hidden="true" className="h-px w-5 bg-border-strong" />
              How it works
            </p>

            {/* All copy shares one grid cell, so the block never changes height. */}
            <div className="mt-6 grid">
              <Copy active={step === -1}>
                <h2 className="journey-headline">From portfolio to proof.</h2>
                <p className="type-lead mt-5 text-muted-foreground">
                  Scroll to follow one portfolio from upload to score.
                </p>
              </Copy>

              {storySteps.map((item, index) => (
                <Copy key={item.id} active={step === index}>
                  <p className="type-label text-muted-foreground">
                    <span className="text-accent-text">{item.number}</span>
                    <span className="text-faint"> · </span>
                    {item.title}
                  </p>
                  <h3 className="journey-headline mt-4">{item.headline}</h3>
                  <p className="type-lead mt-5 max-w-[26rem] text-muted-foreground">
                    {item.body}
                  </p>
                  {item.id === "report" ? (
                    <p className="mt-6 flex items-baseline gap-2">
                      <span
                        ref={scoreRef}
                        className="text-[clamp(3.5rem,7vw,6rem)] leading-none font-medium tracking-[-0.05em] tabular-nums"
                      >
                        0
                      </span>
                      <span className="text-lg text-muted-foreground">
                        / 100
                      </span>
                      <span className="sr-only">Example score: {SCORE}</span>
                    </p>
                  ) : null}
                </Copy>
              ))}
            </div>

            <nav aria-label="How it works steps" className="mt-10 lg:mt-14">
              <ol className="relative flex gap-5 sm:gap-7">
                <span
                  ref={progressRef}
                  aria-hidden="true"
                  className="absolute -top-3 left-0 h-px w-full origin-left scale-x-[var(--journey-progress,0)] bg-foreground/60"
                />
                <span
                  aria-hidden="true"
                  className="absolute -top-3 left-0 h-px w-full bg-border"
                />
                {storySteps.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => goTo(index)}
                      aria-current={step === index ? "step" : undefined}
                      className={cn(
                        "type-label rounded-sm py-1 transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        step === index
                          ? "text-foreground"
                          : "text-faint hover:text-muted-foreground",
                      )}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </Container>
      </div>
    </div>
  );
}

function Copy({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-1 transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:blur-none",
        active
          ? "translate-y-0 opacity-100 blur-0"
          : "pointer-events-none translate-y-4 opacity-0 blur-[2px]",
      )}
    >
      {children}
    </div>
  );
}
