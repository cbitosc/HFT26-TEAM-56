import { cn } from "@/lib/utils";

type WordmarkProps = {
  className?: string;
};

export function Wordmark({ className }: WordmarkProps) {
  return (
    <span
      className={cn(
        "text-lg font-semibold tracking-[-0.04em] text-foreground",
        className,
      )}
    >
      vetted
      <span className="text-primary">.</span>
    </span>
  );
}
