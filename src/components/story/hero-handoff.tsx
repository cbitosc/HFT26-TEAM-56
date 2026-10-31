import type { ReactNode } from "react";

/**
 * Wraps the hero's knot so the story can push it back into the dark as the
 * journey's own knot rises in its place.
 */
export function HeroHandoff({ children }: { children: ReactNode }) {
  return (
    <div data-hero-handoff className="origin-[50%_0%]">
      {children}
    </div>
  );
}
