"use client";

import { useState } from "react";
import { ChevronDown, LoaderCircle, Play, Send } from "lucide-react";
import { CodeEditor } from "@/components/assessment/workspace/code-editor";
import { SaveStatus } from "@/components/assessment/workspace/save-status";
import { TestResults } from "@/components/assessment/workspace/test-results";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { SaveState } from "@/lib/assessment/autosave";
import { LANGUAGE_LABEL, type CodeLanguage } from "@/lib/assessment/config";
import type { ExecutionView, SessionQuestion } from "@/lib/assessment/session";
import { cn } from "@/lib/utils";

type CodeAnswerProps = {
  question: SessionQuestion;
  code: string;
  locked: boolean;
  saveState: SaveState;
  saveError: string | null;
  lastRun: ExecutionView | null;
  submission: ExecutionView | null;
  busy: "run" | "submit" | null;
  /** Another execution is in progress (one at a time). */
  blocked: boolean;
  actionError: string | null;
  onChange: (code: string) => void;
  onRun: () => void;
  onSubmit: () => void;
};

/** Right panel for coding questions: editor, then console/test results, then Run and Submit. */
export function CodeAnswer(props: CodeAnswerProps) {
  const { question, locked, busy } = props;
  const [confirming, setConfirming] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const file = question.starterFiles[0]?.path ?? "solution";
  const language = question.language ?? "javascript";
  const execution = props.submission ?? props.lastRun;
  const disabled = locked || busy !== null || props.blocked;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-stretch justify-between gap-3 border-b border-border bg-surface-1 pr-4">
        <p className="-mb-px flex items-center gap-2 border-r border-b border-r-border border-b-transparent bg-card px-4 text-xs">
          <span className="font-mono text-foreground">{file}</span>
          <span className="text-faint">{LANGUAGE_LABEL[language as CodeLanguage] ?? language}</span>
        </p>
        <SaveStatus state={props.saveState} error={props.saveError} />
      </div>

      <div className="min-h-48 flex-1 bg-card">
        <CodeEditor path={`${question.id}/${file}`} language={language} value={props.code} readOnly={locked} onChange={props.onChange} />
      </div>

      <div className={cn("flex shrink-0 flex-col border-t border-border", consoleOpen ? "h-[38%] min-h-40" : "h-auto")}>
        <button
          type="button"
          onClick={() => setConsoleOpen((open) => !open)}
          aria-expanded={consoleOpen}
          className="flex h-9 shrink-0 cursor-pointer items-center gap-2 bg-surface-1 px-4 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:bg-foreground/[0.04]"
        >
          <ChevronDown className={cn("size-3.5 transition-transform duration-150", !consoleOpen && "-rotate-90")} aria-hidden="true" />
          Console & test results
          {execution ? (
            <span
              className={cn(
                "ml-auto font-normal tabular-nums",
                execution.outcome === "passed" ? "text-primary" : "text-muted-foreground",
              )}
            >
              {execution.passed}/{execution.total} passed
            </span>
          ) : null}
        </button>
        {consoleOpen ? (
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto border-t border-border-subtle">
            <TestResults question={question} execution={execution} />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-2.5">
        <p role="alert" className="mr-auto text-xs text-destructive empty:hidden">
          {props.actionError}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={props.onRun} disabled={disabled} className="ml-auto">
          {busy === "run" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
          {busy === "run" ? "Running…" : "Run Code"}
        </Button>
        <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={disabled}>
          {busy === "submit" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          {locked ? "Submitted" : busy === "submit" ? "Grading…" : "Submit Solution"}
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle>Submit your solution?</DialogTitle>
          <DialogDescription>
            It will be graded against every test, including hidden ones. You can&apos;t change this question afterwards.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Keep editing
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                setConfirming(false);
                props.onSubmit();
              }}
            >
              Submit Solution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
