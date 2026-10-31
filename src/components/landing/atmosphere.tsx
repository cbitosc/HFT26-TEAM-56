import { cn } from "@/lib/utils";

export function Atmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="hero-light absolute inset-x-0 top-0 h-[1100px]" />
      <div className="grid-columns absolute inset-y-0 left-1/2 hidden w-full max-w-[1200px] -translate-x-1/2 border-x border-foreground/[0.055] xl:block" />
      <div className="grain fixed inset-0" />
    </div>
  );
}

/** Lighting layer for a single section. Sits behind the section's content. */
export function SectionLight({
  variant,
  className,
}: {
  variant: "band" | "stage" | "horizon";
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
      <span className="absolute top-0 left-0 h-px w-3 -translate-x-1/2 bg-foreground/[0.14]" />
      <span className="absolute top-0 right-0 h-px w-3 translate-x-1/2 bg-foreground/[0.14]" />
    </div>
  );
}
