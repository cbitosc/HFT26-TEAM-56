"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Width axis range used on the display face (Roboto Flex). */
const NARROW = 25;
const WIDE = 90;
/** Distance, in px, over which a letter reacts to the pointer. */
const REACH = 220;

/**
 * A word whose letters widen as the pointer passes over them, using the
 * display face's variable width axis. Only on devices that can hover.
 */
export function KineticWord({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !window.matchMedia("(hover: hover)").matches) return;

    const letters = Array.from(root.querySelectorAll<HTMLSpanElement>("[data-letter]"));
    const current = letters.map(() => NARROW);
    const pointer = { x: -9999, y: -9999 };
    let frame = 0;
    let settling = false;

    function onPointerMove(event: PointerEvent) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      wake();
    }
    function onPointerLeave() {
      pointer.x = -9999;
      pointer.y = -9999;
      wake();
    }

    function wake() {
      if (!settling) {
        settling = true;
        frame = requestAnimationFrame(update);
      }
    }

    function update() {
      let moving = false;
      letters.forEach((letter, index) => {
        const rect = letter.getBoundingClientRect();
        const dx = pointer.x - (rect.left + rect.width / 2);
        const dy = pointer.y - (rect.top + rect.height / 2);
        const falloff = Math.exp(-((dx * dx + dy * dy) / (REACH * REACH)));
        const target = NARROW + (WIDE - NARROW) * falloff;
        const next = current[index] + (target - current[index]) * 0.16;
        if (Math.abs(target - next) > 0.15) moving = true;
        current[index] = next;
        letter.style.fontVariationSettings = `"wdth" ${next.toFixed(1)}, "wght" 900, "YTUC" 760`;
      });
      if (moving) {
        frame = requestAnimationFrame(update);
      } else {
        settling = false;
      }
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <span ref={ref} aria-hidden="true" className={cn("inline-block whitespace-nowrap", className)}>
      {Array.from(text).map((letter, index) => (
        <span key={index} data-letter className="inline-block">
          {letter}
        </span>
      ))}
    </span>
  );
}
