import { ANSWER_STATUS_LABEL, type AnswerStatus } from "@/lib/assessment/stages";
import { cn } from "@/lib/utils";

const DOT: Record<AnswerStatus, string> = {
  not_started: "bg-transparent",
  in_progress: "bg-primary/50",
  answered: "bg-primary",
  submitted: "bg-foreground/70",
};

/** Compact question numbers for the open stage, each with a status dot. */
export function QuestionNav({
  statuses,
  active,
  onSelect,
  firstNumber = 1,
}: {
  statuses: AnswerStatus[];
  active: number;
  onSelect: (index: number) => void;
  /** Number of the stage's first question across the assessment (1, 5, 9). */
  firstNumber?: number;
}) {
  return (
    <nav aria-label="Questions in this stage">
      <ol className="flex items-center gap-1">
        {statuses.map((status, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={index === active ? "step" : undefined}
              aria-label={`Question ${firstNumber + index}, ${ANSWER_STATUS_LABEL[status]}`}
              title={`Question ${firstNumber + index} · ${ANSWER_STATUS_LABEL[status]}`}
              className={cn(
                "relative flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md px-1.5 text-[13px] tabular-nums outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
                index === active
                  ? "bg-foreground/[0.07] font-medium text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              {firstNumber + index}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-1 size-1 rounded-full",
                  DOT[status],
                  status === "not_started" && "ring-1 ring-border-strong",
                )}
              />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
