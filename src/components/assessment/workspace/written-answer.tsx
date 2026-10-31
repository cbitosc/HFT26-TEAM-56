"use client";

import type { ReactNode } from "react";
import { SaveStatus } from "@/components/assessment/workspace/save-status";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/lib/assessment/autosave";
import { MAX_ANSWER_CHARS, countWords } from "@/lib/assessment/stages";

/** Right panel for theory, situational and written problem-solving questions. */
export function WrittenAnswer({
  questionId,
  value,
  locked,
  saveState,
  saveError,
  onChange,
  onSave,
  action,
}: {
  questionId: string;
  value: string;
  locked: boolean;
  saveState: SaveState;
  saveError: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  /** Next question, or Submit Stage on the last one. */
  action: ReactNode;
}) {
  const words = countWords(value);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-1 px-4">
        <label htmlFor={`answer-${questionId}`} className="text-xs font-medium text-muted-foreground">
          Your answer
        </label>
        <SaveStatus state={saveState} error={saveError} />
      </div>
      <textarea
        id={`answer-${questionId}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={locked}
        maxLength={MAX_ANSWER_CHARS}
        spellCheck
        placeholder={locked ? "" : "Explain your reasoning as you would to a colleague: the approach, why, and the trade-offs."}
        className="scroll-thin min-h-64 w-full flex-1 resize-none bg-card px-6 py-5 text-[15px] leading-7 text-foreground outline-none placeholder:text-faint read-only:opacity-80"
      />
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-background px-4 py-2.5">
        <p className="text-xs text-muted-foreground tabular-nums">
          {words} {words === 1 ? "word" : "words"}
        </p>
        <p className="hidden text-xs text-faint sm:block">Saved automatically. Locked when the stage is submitted.</p>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onSave} disabled={locked || saveState === "saving"}>
            Save now
          </Button>
          {action}
        </div>
      </div>
    </div>
  );
}
