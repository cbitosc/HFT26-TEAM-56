import type { Tier } from "@/lib/assessment/config";
import type { AssessmentSession, ChatTurn, ExecutionView } from "@/lib/assessment/session";
import type { StoredAnswerStatus } from "@/lib/assessment/stages";
import type { ApiErrorBody } from "@/lib/resumes/constants";

// Browser-side calls to the workspace API. Every call resolves to a result
// object instead of throwing, so the UI can always tell the candidate what
// happened and keep their work.

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryable: boolean };

export type AnswerContent = { answerText: string } | { code: string };

const OFFLINE = "You appear to be offline. Your work is kept on this device and will be saved when you reconnect.";

async function call<T>(url: string, init: { method: string; body?: unknown; signal?: AbortSignal }): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: init.signal,
    });
  } catch {
    return { ok: false, status: 0, code: "network_error", message: OFFLINE, retryable: true };
  }
  const body = (await response.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (response.ok && body) return { ok: true, data: body };
  const error = body?.error;
  return {
    ok: false,
    status: response.status,
    code: error?.code ?? "server_error",
    message: error?.message ?? "Something went wrong. Please try again.",
    retryable: error?.retryable ?? response.status >= 500,
  };
}

const base = (assessmentId: string) => `/api/assessments/${assessmentId}`;

export const workspaceApi = {
  session: (assessmentId: string) => call<{ session: AssessmentSession }>(`${base(assessmentId)}/session`, { method: "GET" }),

  save: (assessmentId: string, questionId: string, content: AnswerContent) =>
    call<{ status: StoredAnswerStatus; savedAt: string; revision: number }>(
      `${base(assessmentId)}/questions/${questionId}/answer`,
      { method: "PUT", body: content },
    ),

  run: (assessmentId: string, questionId: string, code: string) =>
    call<{ run: ExecutionView }>(`${base(assessmentId)}/questions/${questionId}/run`, { method: "POST", body: { code } }),

  submitSolution: (assessmentId: string, questionId: string, code: string) =>
    call<{ submission: ExecutionView }>(`${base(assessmentId)}/questions/${questionId}/submit`, { method: "POST", body: { code } }),

  ask: (assessmentId: string, questionId: string, message: string, work: string) =>
    call<{ turn: ChatTurn; hintNumber: number | null }>(`${base(assessmentId)}/questions/${questionId}/assistant`, {
      method: "POST",
      body: { message, work },
    }),

  submitStage: (assessmentId: string, tier: Tier, answers: ({ questionId: string } & AnswerContent)[]) =>
    call<{ result: "submitted" | "already_closed"; session: AssessmentSession | null }>(
      `${base(assessmentId)}/stages/${tier}/submit`,
      { method: "POST", body: { answers } },
    ),
};

/** Errors that mean the answer can no longer change: stop retrying and reload the stage. */
export const LOCKED_CODES = new Set(["stage_closed", "answer_locked", "assessment_closed", "stage_locked", "already_submitted"]);
