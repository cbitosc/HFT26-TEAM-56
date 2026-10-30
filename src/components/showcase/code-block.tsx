import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const KEYWORDS = new Set([
  "async",
  "await",
  "function",
  "const",
  "let",
  "return",
  "if",
  "while",
  "for",
  "of",
  "new",
]);

const TOKEN =
  /(\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:async|await|function|const|let|return|if|while|for|of|new)\b)/g;

export function highlight(line: string) {
  return line.split(TOKEN).map((part, index) => {
    if (!part) return null;

    let className: string | undefined;
    if (part.startsWith("//")) className = "text-faint";
    else if (part.startsWith('"') || part.startsWith("'"))
      className = "text-foreground/70";
    else if (KEYWORDS.has(part)) className = "text-primary";

    if (!className) return <span key={index}>{part}</span>;

    return (
      <span key={index} className={className}>
        {part}
      </span>
    );
  });
}

type CodeBlockProps = {
  filename: string;
  lines: readonly string[];
  meta?: ReactNode;
  caretLine?: number;
  minLines?: number;
  className?: string;
};

export function CodeBlock({
  filename,
  lines,
  meta,
  caretLine,
  minLines = 0,
  className,
}: CodeBlockProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      <div className="flex h-9 items-center justify-between gap-3 border-b border-border-subtle px-3">
        <span className="truncate font-mono text-[11.5px] text-muted-foreground">
          {filename}
        </span>
        {meta ? (
          <span className="shrink-0 font-mono text-[11px] text-faint">
            {meta}
          </span>
        ) : null}
      </div>
      <pre
        tabIndex={0}
        aria-label={`${filename} source`}
        className="overflow-x-auto py-3 font-mono text-[12px] leading-5 text-foreground/90 outline-none [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <code
          className="block min-w-fit"
          style={{ minHeight: minLines ? `${minLines * 1.25}rem` : undefined }}
        >
          {lines.map((line, index) => {
            const number = index + 1;
            const active = number === caretLine;

            return (
              <span
                key={index}
                className={cn(
                  "flex gap-4 pr-4 pl-3",
                  active && "bg-white/[0.025]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-5 shrink-0 text-right tabular-nums select-none",
                    active ? "text-muted-foreground" : "text-faint/60",
                  )}
                >
                  {number}
                </span>
                <span className="whitespace-pre">
                  {highlight(line)}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="ml-px inline-block h-[1.05em] w-[1.5px] translate-y-[0.2em] bg-foreground/80"
                    />
                  ) : null}
                </span>
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
