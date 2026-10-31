"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "vetted:split";
const MIN = 25;
const MAX = 65;
const DEFAULT = 40;

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

const noopSubscribe = () => () => {};

function readSavedWidth() {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return saved ? clamp(saved) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/**
 * Question | Answer. On large screens two columns with a draggable divider
 * (also keyboard-adjustable); the width is remembered on this device. On
 * small screens one panel at a time, chosen by `mobilePanel`.
 */
export function SplitPane({
  left,
  right,
  mobilePanel,
  leftLabel,
  rightLabel,
}: {
  left: ReactNode;
  right: ReactNode;
  mobilePanel: "left" | "right";
  leftLabel: string;
  rightLabel: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  // The saved width, read without a hydration mismatch (the server renders the default).
  const saved = useSyncExternalStore(noopSubscribe, readSavedWidth, () => DEFAULT);
  const [override, setWidth] = useState<number | null>(null);
  const width = override ?? saved;
  const [dragging, setDragging] = useState(false);

  const commit = useCallback((value: number) => {
    const next = clamp(value);
    setWidth(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Math.round(next)));
    } catch {
      // Not persisted; fine.
    }
  }, []);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging || !container.current) return;
    const rect = container.current.getBoundingClientRect();
    setWidth(clamp(((event.clientX - rect.left) / rect.width) * 100));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    commit(width);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") commit(width - step);
    else if (event.key === "ArrowRight") commit(width + step);
    else if (event.key === "Home") commit(MIN);
    else if (event.key === "End") commit(MAX);
    else return;
    event.preventDefault();
  }

  return (
    <div
      ref={container}
      className={cn("relative flex min-h-0 flex-1 lg:grid", dragging && "cursor-col-resize select-none")}
      style={{ gridTemplateColumns: `${width}% 1px minmax(0, 1fr)` }}
    >
      <section
        aria-label={leftLabel}
        className={cn("scroll-thin min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex", mobilePanel === "left" ? "flex" : "hidden")}
      >
        {left}
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => commit(DEFAULT)}
        className="relative z-10 hidden w-px cursor-col-resize bg-border outline-none transition-colors duration-150 after:absolute after:inset-y-0 after:-left-1.5 after:w-3.5 after:content-[''] hover:bg-primary/50 focus-visible:bg-primary lg:block"
      />

      <section
        aria-label={rightLabel}
        className={cn("min-h-0 min-w-0 flex-1 flex-col lg:flex", mobilePanel === "right" ? "flex" : "hidden")}
      >
        {right}
      </section>
    </div>
  );
}
