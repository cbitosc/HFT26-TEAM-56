import { cn } from "@/lib/utils";

type WordmarkProps = {
  className?: string;
};

/** The wordmark's square on its own: the compact logo and the Vetted AI icon. */
export function BrandMark({ className }: WordmarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2",
        className,
      )}
    >
      <span className="size-[30%] rounded-[2px] bg-primary" />
    </span>
  );
}

export function Wordmark({ className }: WordmarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline text-lg font-semibold tracking-[-0.04em] text-foreground",
        className,
      )}
    >
      vetted
      <span
        aria-hidden="true"
        className="ml-[0.08em] inline-block size-[0.22em] rounded-[1px] bg-primary"
      />
    </span>
  );
}
