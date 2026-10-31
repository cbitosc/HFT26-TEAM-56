"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

declare global {
  interface Window {
    /** The page's smooth scroller, when one is running. */
    __lenis?: Lenis;
  }
}

/**
 * Smooths wheel scrolling so scroll-driven scenes move continuously instead of
 * in wheel-sized steps. Touch scrolling stays native, and nothing runs for
 * reduced motion. In-page links glide to their target under the navbar.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.1,
      anchors: { offset: -56 },
    });
    window.__lenis = lenis;

    return () => {
      lenis.destroy();
      delete window.__lenis;
    };
  }, []);

  return null;
}

/** Scrolls to `top`, through the smooth scroller when it is running. */
export function scrollToTop(top: number) {
  if (window.__lenis) window.__lenis.scrollTo(top);
  else window.scrollTo({ top, behavior: "smooth" });
}
