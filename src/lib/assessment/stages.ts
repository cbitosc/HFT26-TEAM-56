import { TIER_CONFIG, TIERS, type Tier } from "@/lib/assessment/config";

// Stage and answer rules shared by the server and the workspace UI. The
// database enforces them (supabase/migrations/20261031050000_stage_workflow.sql);
// the client uses the same rules only to display state.

export type StageStatus = "locked" | "active" | "submitted" | "expired";
export type StoredAnswerStatus = "in_progress" | "answered" | "submitted";
export type AnswerStatus = "not_started" | StoredAnswerStatus;

/** Written answers count as answered from this many words. Mirrors save_assessment_answer. */
export const ANSWERED_MIN_WORDS = 10;

export const MAX_ANSWER_CHARS = 20_000;
export const MAX_CODE_CHARS = 100_000;
export const MAX_PROMPT_CHARS = 2_000;

export function countWords(text: string | null | undefined) {
  const trimmed = (text ?? "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function nextTier(tier: Tier): Tier | null {
  return TIERS[TIERS.indexOf(tier) + 1] ?? null;
}

export function stageTitle(tier: Tier) {
  const { label, difficulty } = TIER_CONFIG[tier];
  return `${label} — ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`;
}

/** The number of the first question of a stage across the whole assessment (1, 5, 9). */
export function firstQuestionNumber(tier: Tier, perTier = 4) {
  return TIERS.indexOf(tier) * perTier + 1;
}

export function writtenAnswerStatus(text: string, locked: boolean): AnswerStatus {
  if (locked) return "submitted";
  const words = countWords(text);
  if (words === 0) return "not_started";
  return words >= ANSWERED_MIN_WORDS ? "answered" : "in_progress";
}

/**
 * Code is in progress once it differs from the starter, and answered when
 * the latest passing Run Code was on exactly this code.
 */
export function practicalAnswerStatus({
  code,
  starter,
  passingCode,
  locked,
}: {
  code: string;
  starter: string;
  passingCode: string | null;
  locked: boolean;
}): AnswerStatus {
  if (locked) return "submitted";
  if (passingCode !== null && passingCode === code) return "answered";
  return code.trim() && code !== starter ? "in_progress" : "not_started";
}

export const ANSWER_STATUS_LABEL: Record<AnswerStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  answered: "Answered",
  submitted: "Submitted",
};

/** Milliseconds left until `deadline`, by a clock offset to the server's. */
export function remainingMs(deadline: string | null, serverOffsetMs: number, now = Date.now()) {
  if (!deadline) return 0;
  return Math.max(0, new Date(deadline).getTime() - (now + serverOffsetMs));
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
