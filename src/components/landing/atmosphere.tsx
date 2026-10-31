import { SmokeLayer } from "@/components/landing/smoke-layer";
import { cn } from "@/lib/utils";

/**
 * Viewport atmosphere, fixed so the room stays present while the page
 * scrolls. The WebGL smoke covers the CSS plates and haze once it draws;
 * without WebGL those plates are the atmosphere. Grain sits on top of both.
 */
export function Atmosphere() {
  return (
    <div
      aria-hidden="true"
      className="atmosphere pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="atmosphere-base" />
      <span className="atmosphere-motion atmosphere-motion-room">
        <span className="atmosphere-plate plate-room-wine" />
      </span>
      <span className="atmosphere-motion">
        <span className="atmosphere-plate plate-room-side" />
      </span>
      <span className="atmosphere-motion atmosphere-motion-haze">
        <span className="atmosphere-plate plate-room-haze" />
      </span>
      <div className="atmosphere-haze" />
      <SmokeLayer />
      <div className="grain" />
    </div>
  );
}

/**
 * Extra light for the top of the landing page. It scrolls away with the
 * hero so later sections are not a copy of the opening.
 */
export function HeroAtmosphere() {
  return (
    <div
      aria-hidden="true"
      className="hero-atmosphere pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden"
    >
      <span className="atmosphere-motion">
        <span className="atmosphere-plate plate-hero-lift" />
      </span>
      <span className="atmosphere-motion atmosphere-motion-hero">
        <span className="atmosphere-plate plate-hero-wine" />
      </span>
      <span className="atmosphere-motion atmosphere-motion-leak">
        <span className="atmosphere-plate plate-hero-leak" />
      </span>
      <span className="atmosphere-motion">
        <span className="atmosphere-plate plate-hero-crimson" />
      </span>
    </div>
  );
}

/** The page's column rules. Landing only. */
export function ColumnGuides() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      <div className="grid-columns absolute inset-y-0 left-1/2 hidden w-full max-w-[1200px] -translate-x-1/2 border-x border-border-subtle xl:block" />
    </div>
  );
}

/** Lighting layer for a single section. Sits behind the section's content. */
export function SectionLight({
  variant,
  className,
}: {
  variant: "band" | "stage" | "horizon" | "veil" | "drift";
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0",
        `light-${variant}`,
        className,
      )}
    />
  );
}

/** Short ticks where a section meets the column rules, in place of a full-width border. */
export function GridMarks() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-1/2 hidden w-full max-w-[1200px] -translate-x-1/2 xl:block"
    >
      <span className="absolute top-0 left-0 h-px w-3 -translate-x-1/2 bg-border-strong" />
      <span className="absolute top-0 right-0 h-px w-3 translate-x-1/2 bg-border-strong" />
    </div>
  );
}
