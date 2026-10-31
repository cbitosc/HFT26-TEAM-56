import { Check, X } from "lucide-react";
import type { ExecutionView, SessionQuestion } from "@/lib/assessment/session";
import { cn } from "@/lib/utils";

const OUTCOME_LABEL: Record<ExecutionView["outcome"], string> = {
  passed: "All tests passed",
  failed: "Some tests failed",
  compile_error: "Compilation error",
  runtime_error: "Runtime error",
  timeout: "Time limit exceeded",
  memory_limit: "Memory limit exceeded",
  output_limit: "Output limit exceeded",
};

/** Output, errors and per-test results of the latest run or the graded submission. */
export function TestResults({ question, execution }: { question: SessionQuestion; execution: ExecutionView | null }) {
  if (!execution) {
    return (
      <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
        Run your code to check it against the examples.
        <span className="mt-1 block text-xs text-faint">Results and console output appear here.</span>
      </p>
    );
  }
  const examples = new Map(question.exampleTests.map((test) => [test.name, test]));
  const submitted = execution.type !== "run";
  return (
    <div className="space-y-4 p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={cn("text-sm font-medium", execution.outcome === "passed" ? "text-primary" : "text-foreground")}>
          {submitted ? "Submitted: " : ""}
          {OUTCOME_LABEL[execution.outcome]}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {execution.passed}/{execution.total} passed
          {execution.executionTimeMs !== null ? ` · ${execution.executionTimeMs} ms` : ""}
        </p>
      </div>

      {execution.error ? (
        <pre className="overflow-x-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-destructive">
          {execution.error}
        </pre>
      ) : null}

      {execution.tests.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {execution.tests.map((test) => {
            const example = examples.get(test.name);
            return (
              <li key={test.name} className="px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  {test.passed ? (
                    <Check className="size-3.5 text-primary" aria-label="Passed" />
                  ) : (
                    <X className="size-3.5 text-destructive" aria-label="Failed" />
                  )}
                  <span className="text-foreground">{test.name}</span>
                </div>
                {!test.passed && example ? (
                  <dl className="mt-1.5 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 pl-5.5 font-mono leading-5">
                    <dt className="text-faint">Input</dt>
                    <dd className="overflow-x-auto text-foreground/85">{example.args.map((arg) => JSON.stringify(arg)).join(", ")}</dd>
                    <dt className="text-faint">Expected</dt>
                    <dd className="overflow-x-auto text-foreground/85">{example.expectThrows ? "an error" : JSON.stringify(example.expected)}</dd>
                    <dt className="text-faint">{test.error ? "Error" : "Received"}</dt>
                    <dd className="overflow-x-auto text-foreground/85">{test.error ?? test.actual ?? "—"}</dd>
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {execution.hidden ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          Hidden tests: {execution.hidden.passed}/{execution.hidden.total} passed
        </p>
      ) : null}

      {execution.logs.length ? (
        <div>
          <p className="type-label text-faint">Output</p>
          <pre className="mt-1.5 max-h-48 overflow-auto rounded-md border border-border bg-surface-1 p-3 font-mono text-xs leading-5 text-foreground/85">
            {execution.logs.join("\n")}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
