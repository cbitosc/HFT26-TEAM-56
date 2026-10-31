"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** The hero's particle knot. Renders nothing visible until the scene loads. */
export function HeroOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas: HTMLCanvasElement = element;
    let cancelled = false;
    let dispose: (() => void) | undefined;

    // Three.js is the page's heaviest script, so it loads once the headline
    // has painted and the browser is idle. The knot fades in either way.
    function load() {
      import("@/components/landing/hero-orb-scene")
        .then(({ createHeroOrb }) => {
          if (!cancelled) dispose = createHeroOrb(canvas);
        })
        .catch(() => {
          // Without WebGL the type carries the hero on its own.
        });
    }
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(load, { timeout: 1200 })
      : window.setTimeout(load, 300);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      dispose?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("block size-full", className)}
    />
  );
}
