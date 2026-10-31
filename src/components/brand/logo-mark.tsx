import { cn } from "@/lib/utils";

/**
 * The Vetted mark: a V drawn as one check-mark stroke (short arm, long arm),
 * so "vetted" reads as "checked". `withSquare` adds the crimson square used
 * when the mark stands alone; beside the wordmark it is left off, because the
 * wordmark already ends in one.
 */
export function LogoMark({
  className,
  withSquare = false,
}: {
  className?: string;
  withSquare?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <polygon
        fill="currentColor"
        points="8,30 19,30 27,42 46,10 57,10 31,54 23,54"
      />
      {withSquare ? (
        <rect x="49" y="45" width="8" height="8" rx="1" className="fill-accent-strong" />
      ) : null}
    </svg>
  );
}
