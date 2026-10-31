"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { applyWidth, clampWidth, readSavedWidth, saveWidth, type PanelSize } from "@/lib/layout";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

type ResizeHandleProps = {
  size: PanelSize;
  /** Which edge of its panel the handle sits on. Dragging away from the panel widens it. */
  edge: "left" | "right";
  label: string;
  /** id of the panel being resized. */
  controls?: string;
  className?: string;
};

/**
 * Drag handle for a panel whose width lives in a CSS custom property. Only
 * the custom property changes while dragging, so the panel's contents never
 * re-render. Arrow keys resize by 8px (32px with Shift), Home and End jump
 * to the limits, and a double click restores the default width.
 */
export function ResizeHandle({ size, edge, label, controls, className }: ResizeHandleProps) {
  // The saved width, read without a hydration mismatch (the server renders the default).
  const saved = useSyncExternalStore(noopSubscribe, () => readSavedWidth(size), () => size.initial);
  const [override, setOverride] = useState<number | null>(null);
  const width = override ?? saved;
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number; latest: number } | null>(null);
  const direction = edge === "right" ? 1 : -1;

  function set(next: number, persist: boolean) {
    const value = clampWidth(size, next);
    applyWidth(size, value);
    setOverride(value);
    if (drag.current) drag.current.latest = value;
    if (persist) saveWidth(size, value);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width, latest: width };
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    set(drag.current.startWidth + direction * (event.clientX - drag.current.startX), false);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    saveWidth(size, drag.current.latest);
    drag.current = null;
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 32 : 8;
    if (event.key === "ArrowRight") set(width + direction * step, true);
    else if (event.key === "ArrowLeft") set(width - direction * step, true);
    else if (event.key === "Home") set(size.min, true);
    else if (event.key === "End") set(size.max, true);
    else return;
    event.preventDefault();
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={() => set(size.initial, true)}
      data-dragging={dragging || undefined}
      className={cn(
        "group absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none outline-none",
        edge === "right" ? "-right-2" : "-left-2",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-3 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors duration-150 group-hover:bg-primary/60 group-focus-visible:bg-primary group-data-dragging:bg-primary"
      />
    </div>
  );
}
