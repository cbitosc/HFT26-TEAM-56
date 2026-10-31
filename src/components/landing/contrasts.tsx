"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Each row pairs what a generic screen does with what Vetted does instead. */
const contrasts = [
  {
    generic: "The same questions for everyone",
    vetted: "Questions written from your portfolio",
  },
  {
    generic: "Your projects are never opened",
    vetted: "Starts from what you've actually built",
  },
  {
    generic: "Pass or fail, with no reason given",
    vetted: "Every test result, shown and explained",
  },
] as const;

/**
 * The comparison as a scroll sequence: as each row reaches the middle of the
 * screen, the generic claim is struck through and Vetted's answer lights up.
 */
export function Contrasts({ className }: { className?: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  // Every row reads as settled until the script confirms it can animate.
  const [settled, setSettled] = useState<boolean[]>(() =>
    contrasts.map(() => true),
  );

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-row]"));

    // Rows already above the fold stay settled; the rest wait their turn.
    setSettled(
      rows.map(
        (row) => row.getBoundingClientRect().top < window.innerHeight * 0.55,
      ),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = rows.indexOf(entry.target as HTMLElement);
          setSettled((previous) =>
            previous[index]
              ? previous
              : previous.map((value, i) => (i === index ? true : value)),
          );
          observer.unobserve(entry.target);
        }
      },
      // A row resolves once it crosses the lower middle of the viewport.
      { rootMargin: "0px 0px -45% 0px" },
    );
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={className}>
      <div className="hidden grid-cols-2 gap-x-12 pb-5 sm:grid">
        <p className="type-label text-muted-foreground">A typical coding test</p>
        <p className="type-label flex items-center gap-3 text-foreground">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-strong" />
          Vetted
        </p>
      </div>
      <ol ref={listRef} className="border-t border-border">
        {contrasts.map((row, index) => {
          const on = settled[index];
          return (
            <li
              key={row.vetted}
              data-row
              className="grid gap-x-12 gap-y-3 border-b border-border py-7 sm:grid-cols-2 lg:py-9"
            >
              <p className="relative w-fit text-xl leading-snug tracking-[-0.025em] text-balance text-muted-foreground/60 sm:text-2xl">
                <span className="sr-only">A typical coding test: </span>
                {row.generic}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-[55%] left-0 h-[2px] w-full origin-left bg-accent-strong/70 transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]",
                    on ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </p>
              <p
                className={cn(
                  "flex gap-3 text-xl leading-snug tracking-[-0.025em] text-balance transition-[color,opacity,transform] delay-300 duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:text-2xl",
                  on
                    ? "translate-x-0 text-foreground opacity-100"
                    : "translate-x-2 text-muted-foreground opacity-40 motion-reduce:translate-x-0",
                )}
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent-strong sm:hidden"
                />
                <span>
                  <span className="sr-only">Vetted: </span>
                  {row.vetted}
                </span>
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
