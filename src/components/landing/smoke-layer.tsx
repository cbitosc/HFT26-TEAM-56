"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The WebGL smoke, laid over the CSS atmosphere and faded in once its first
 * frame is drawn. Without WebGL the CSS atmosphere underneath is what shows.
 */
export function SmokeLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;

    import("@/components/landing/smoke-scene")
      .then(({ createSmoke }) => {
        if (cancelled) return;
        dispose = createSmoke(canvas, () => setReady(true));
      })
      .catch(() => {
        // Keep the CSS atmosphere.
      });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "absolute inset-0 size-full transition-opacity duration-[1600ms] ease-out",
        ready ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
