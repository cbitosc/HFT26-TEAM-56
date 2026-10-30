import { cn } from "@/lib/utils";

type WordmarkProps = {
  className?: string;
};

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
