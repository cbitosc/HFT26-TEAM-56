import "server-only";
import { TIER_CONFIG, type CodeLanguage, type Tier } from "@/lib/assessment/config";
import {
  PUBLIC_QUESTION_COLUMNS,
  toPublicQuestion,
  type PublicQuestion,
  type QuestionRow,
} from "@/lib/assessment/public";
import type { TestCase } from "@/lib/assessment/schemas";
import { firstQuestionNumber, type StageStatus, type StoredAnswerStatus } from "@/lib/assessment/stages";
import { AssessmentStoreError, getAssessment, type AssessmentRow } from "@/lib/assessment/store";
import type { ExecutionReport } from "@/lib/execution/execute";
import { createAdminClient } from "@/lib/supabase/admin";

// The candidate's live assessment: stage state, the current stage's
// questions, answers, runs and AI conversations. Every function takes the
// verified user id. Stage transitions happen in the database functions
// (sync_assessment_progress, submit_assessment_stage); this module calls
// them and shapes what the workspace may see. Only the active stage's
// questions are ever loaded for the client.

function fail(action: string, error: { message: string }): never {
  throw new AssessmentStoreError(`${action}: ${error.message}`, { cause: error });
}

export type SessionStage = {
  tier: Tier;
  label: string;
  difficulty: string;
  status: StageStatus;
  minutes: number;
  aiAssistance: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
};

export type PublicTestResult = {
  name: string;
  passed: boolean;
  actual?: string;
  error?: string;
};

export type ExecutionView = {
  type: "run" | "submit" | "auto_submit";
  outcome: ExecutionReport["outcome"];
  passed: number;
  total: number;
  executionTimeMs: number | null;
  createdAt: string;
  /** Results of the public example tests. */
  tests: PublicTestResult[];
  /** Hidden tests appear only as counts. */
  hidden: { passed: number; total: number } | null;
  logs: string[];
  error: string | null;
};

export type ChatTurn = { id: string; prompt: string; response: string; createdAt: string };

export type SessionAnswer = {
  answerText: string | null;
  code: string | null;
  status: StoredAnswerStatus;
  savedAt: string;
  revision: number;
};

export type SessionQuestion = PublicQuestion & { number: number };

export type AssessmentSession = {
  assessmentId: string;
  status: "in_progress" | "completed" | "expired";
  technicalDomain: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  serverTime: string;
  stages: SessionStage[];
  /** The open stage, or null once the assessment is finished. */
  currentTier: Tier | null;
  /** The open stage's four questions only. */
  questions: SessionQuestion[];
  answers: Record<string, SessionAnswer>;
  lastRuns: Record<string, ExecutionView>;
  submissions: Record<string, ExecutionView>;
  /** The code of the latest passing run, per question, for answered status. */
  passingCode: Record<string, string | null>;
  chats: Record<string, ChatTurn[]>;
  /** Counts for the completion screen. */
  summary: { answered: number; total: number } | null;
};

type StageRow = {
  tier: Tier;
  status: StageStatus;
  duration_minutes: number;
  started_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
};

type AnswerRow = {
  question_id: string;
  answer_text: string | null;
  code: string | null;
  status: StoredAnswerStatus;
  saved_at: string;
  revision: number;
};

type ExecutionRow = {
  question_id: string;
  execution_type: ExecutionView["type"];
  outcome: ExecutionView["outcome"];
  passed_tests: number;
  total_tests: number;
  execution_time_ms: number | null;
  code_sha256: string;
  results: { tests?: PublicTestResult[]; hidden?: ExecutionView["hidden"]; logs?: string[]; error?: string | null };
  created_at: string;
};

/** Applies passed deadlines. Returns the assessment status, or null if it isn't this user's. */
export async function syncAssessment(userId: string, assessmentId: string): Promise<AssessmentRow["status"] | null> {
  const { data, error } = await createAdminClient().rpc("sync_assessment_progress", {
    p_assessment_id: assessmentId,
    p_user_id: userId,
  });
  if (error) fail("Sync assessment", error);
  return (data as AssessmentRow["status"] | null) ?? null;
}

async function loadStages(assessmentId: string): Promise<SessionStage[]> {
  const { data, error } = await createAdminClient()
    .from("assessment_stages")
    .select("tier, status, duration_minutes, started_at, expires_at, submitted_at")
    .eq("assessment_id", assessmentId)
    .order("position")
    .returns<StageRow[]>();
  if (error) fail("Load stages", error);
  return (data ?? []).map((stage) => ({
    tier: stage.tier,
    label: TIER_CONFIG[stage.tier].label,
    difficulty: TIER_CONFIG[stage.tier].difficulty,
    status: stage.status,
    minutes: stage.duration_minutes,
    aiAssistance: TIER_CONFIG[stage.tier].aiAssistance,
    startedAt: stage.started_at,
    expiresAt: stage.expires_at,
    submittedAt: stage.submitted_at,
  }));
}

export function toExecutionView(row: ExecutionRow): ExecutionView {
  return {
    type: row.execution_type,
    outcome: row.outcome,
    passed: row.passed_tests,
    total: row.total_tests,
    executionTimeMs: row.execution_time_ms,
    createdAt: row.created_at,
    tests: row.results.tests ?? [],
    hidden: row.results.hidden ?? null,
    logs: row.results.logs ?? [],
    error: row.results.error ?? null,
  };
}

/** What a run may store and return: public test details, hidden tests as counts. */
export function toStoredResults(report: ExecutionReport) {
  const hidden = report.tests.filter((test) => test.hidden);
  return {
    tests: report.tests
      .filter((test) => !test.hidden)
      .map(({ name, passed, actual, error }) => ({ name, passed, ...(actual !== undefined ? { actual } : {}), ...(error ? { error } : {}) })),
    hidden: hidden.length ? { passed: hidden.filter((test) => test.passed).length, total: hidden.length } : null,
    logs: report.logs.slice(0, 200),
    error: report.error,
  };
}

/**
 * The candidate's view of an assessment that has started: stage state and,
 * while a stage is open, that stage's questions with saved work. Returns
 * null when it isn't theirs or hasn't started.
 */
export async function loadAssessmentSession(userId: string, assessmentId: string): Promise<AssessmentSession | null> {
  const status = await syncAssessment(userId, assessmentId);
  if (!status || !["in_progress", "completed", "expired"].includes(status)) return null;
  const row = await getAssessment(userId, assessmentId);
  if (!row) return null;

  const admin = createAdminClient();
  const stages = await loadStages(assessmentId);
  const active = stages.find((stage) => stage.status === "active") ?? null;
  const base = {
    assessmentId,
    status: status as AssessmentSession["status"],
    technicalDomain: row.technical_domain,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    serverTime: new Date().toISOString(),
    stages,
    currentTier: active?.tier ?? null,
  };

  if (!active) {
    const [answersResult, totalResult] = await Promise.all([
      admin.from("assessment_answers").select("answer_text, code").eq("assessment_id", assessmentId),
      admin.from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId),
    ]);
    if (answersResult.error) fail("Count answers", answersResult.error);
    if (totalResult.error) fail("Count questions", totalResult.error);
    const answered = (answersResult.data ?? []).filter((answer) => (answer.answer_text ?? answer.code ?? "").trim()).length;
    return {
      ...base,
      questions: [],
      answers: {},
      lastRuns: {},
      submissions: {},
      passingCode: {},
      chats: {},
      summary: { answered, total: totalResult.count ?? 0 },
    };
  }

  const { data: questionRows, error: questionsError } = await admin
    .from("assessment_questions")
    .select(PUBLIC_QUESTION_COLUMNS)
    .eq("assessment_id", assessmentId)
    .eq("tier", active.tier)
    .order("display_order")
    .returns<QuestionRow[]>();
  if (questionsError) fail("Load stage questions", questionsError);
  const first = firstQuestionNumber(active.tier);
  const questions = (questionRows ?? []).map((q, index) => ({ ...toPublicQuestion(q), number: first + index }));
  const ids = questions.map((q) => q.id);

  const [answersResult, executionsResult, chatsResult] = await Promise.all([
    admin
      .from("assessment_answers")
      .select("question_id, answer_text, code, status, saved_at, revision")
      .in("question_id", ids)
      .returns<AnswerRow[]>(),
    admin
      .from("code_executions")
      .select("question_id, execution_type, outcome, passed_tests, total_tests, execution_time_ms, code_sha256, results, created_at")
      .in("question_id", ids)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<ExecutionRow[]>(),
    admin
      .from("ai_interactions")
      .select("id, question_id, candidate_prompt, assistant_response, created_at")
      .in("question_id", ids)
      .order("created_at")
      .returns<{ id: string; question_id: string; candidate_prompt: string; assistant_response: string; created_at: string }[]>(),
  ]);
  if (answersResult.error) fail("Load answers", answersResult.error);
  if (executionsResult.error) fail("Load executions", executionsResult.error);
  if (chatsResult.error) fail("Load assistant history", chatsResult.error);

  const answers: AssessmentSession["answers"] = {};
  for (const answer of answersResult.data ?? []) {
    answers[answer.question_id] = {
      answerText: answer.answer_text,
      code: answer.code,
      status: answer.status,
      savedAt: answer.saved_at,
      revision: answer.revision,
    };
  }

  const lastRuns: AssessmentSession["lastRuns"] = {};
  const submissions: AssessmentSession["submissions"] = {};
  const passingCode: AssessmentSession["passingCode"] = {};
  // Newest first, so the first run seen per question is the latest.
  for (const execution of executionsResult.data ?? []) {
    if (execution.execution_type === "run") {
      lastRuns[execution.question_id] ??= toExecutionView(execution);
    } else {
      submissions[execution.question_id] ??= toExecutionView(execution);
    }
  }
  for (const [questionId, answer] of Object.entries(answers)) {
    passingCode[questionId] = answer.status === "answered" && answer.code !== null ? answer.code : null;
  }

  const chats: AssessmentSession["chats"] = {};
  for (const turn of chatsResult.data ?? []) {
    (chats[turn.question_id] ??= []).push({
      id: turn.id,
      prompt: turn.candidate_prompt,
      response: turn.assistant_response,
      createdAt: turn.created_at,
    });
  }

  return { ...base, questions, answers, lastRuns, submissions, passingCode, chats, summary: null };
}

// ---------------------------------------------------------------------------
// Guards for question-level actions
// ---------------------------------------------------------------------------

export type SessionErrorCode =
  | "not_found"
  | "not_started"
  | "assessment_closed"
  | "question_not_found"
  | "stage_locked"
  | "stage_closed"
  | "answer_locked"
  | "already_submitted";

export class SessionError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

export const SESSION_ERROR_MESSAGES: Record<SessionErrorCode, string> = {
  not_found: "Assessment not found.",
  not_started: "This assessment hasn't started yet.",
  assessment_closed: "This assessment has ended. Your saved work has been kept.",
  question_not_found: "Question not found in this assessment.",
  stage_locked: "This question belongs to a stage that hasn't started.",
  stage_closed: "This stage has closed. Your saved work has been locked in.",
  answer_locked: "This answer has already been submitted and can't be changed.",
  already_submitted: "This solution has already been submitted.",
};

export const SESSION_ERROR_STATUS: Record<SessionErrorCode, number> = {
  not_found: 404,
  not_started: 409,
  assessment_closed: 409,
  question_not_found: 404,
  stage_locked: 403,
  stage_closed: 409,
  answer_locked: 409,
  already_submitted: 409,
};

function sessionError(code: SessionErrorCode): never {
  throw new SessionError(code, SESSION_ERROR_MESSAGES[code]);
}

export type ActiveQuestion = {
  assessment: AssessmentRow;
  stage: SessionStage;
  question: PublicQuestion;
  answer: SessionAnswer | null;
};

/**
 * Verifies, after applying deadlines, that the assessment is the user's and
 * running, and that the question belongs to the stage that is open now.
 */
export async function requireActiveQuestion(userId: string, assessmentId: string, questionId: string): Promise<ActiveQuestion> {
  const status = await syncAssessment(userId, assessmentId);
  if (!status) sessionError("not_found");
  if (status === "ready" || status === "generating" || status === "pending" || status === "failed") sessionError("not_started");
  if (status !== "in_progress") sessionError("assessment_closed");

  const admin = createAdminClient();
  const [assessment, questionResult, stages] = await Promise.all([
    getAssessment(userId, assessmentId),
    admin
      .from("assessment_questions")
      .select(PUBLIC_QUESTION_COLUMNS)
      .eq("assessment_id", assessmentId)
      .eq("id", questionId)
      .maybeSingle<QuestionRow>(),
    loadStages(assessmentId),
  ]);
  if (questionResult.error) fail("Load question", questionResult.error);
  if (!assessment) sessionError("not_found");
  if (!questionResult.data) sessionError("question_not_found");
  const question = toPublicQuestion(questionResult.data);
  const stage = stages.find((s) => s.tier === question.tier);
  if (!stage || stage.status === "locked") sessionError("stage_locked");
  if (stage.status !== "active" || !stage.expiresAt || new Date(stage.expiresAt).getTime() <= Date.now()) {
    sessionError("stage_closed");
  }

  const { data: answer, error } = await admin
    .from("assessment_answers")
    .select("question_id, answer_text, code, status, saved_at, revision")
    .eq("question_id", questionId)
    .maybeSingle<AnswerRow>();
  if (error) fail("Load answer", error);

  return {
    assessment,
    stage,
    question,
    answer: answer
      ? { answerText: answer.answer_text, code: answer.code, status: answer.status, savedAt: answer.saved_at, revision: answer.revision }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Writes (all through the database functions)
// ---------------------------------------------------------------------------

type RpcResult = { result: string } & Record<string, unknown>;

async function rpc(name: string, args: Record<string, unknown>, action: string): Promise<RpcResult> {
  const { data, error } = await createAdminClient().rpc(name, args);
  if (error) fail(action, error);
  return data as RpcResult;
}

const RESULT_ERRORS: Record<string, SessionErrorCode> = {
  not_found: "not_found",
  not_started: "not_started",
  assessment_closed: "assessment_closed",
  question_not_found: "question_not_found",
  stage_locked: "stage_locked",
  stage_closed: "stage_closed",
  answer_locked: "answer_locked",
  already_submitted: "already_submitted",
};

function throwForResult(result: RpcResult, ok: string[]) {
  if (ok.includes(result.result)) return;
  const code = RESULT_ERRORS[result.result];
  if (code) sessionError(code);
  throw new AssessmentStoreError(`Unexpected result: ${result.result}`);
}

export async function saveAnswer(
  userId: string,
  assessmentId: string,
  questionId: string,
  content: { answerText?: string | null; code?: string | null },
) {
  const result = await rpc(
    "save_assessment_answer",
    {
      p_assessment_id: assessmentId,
      p_user_id: userId,
      p_question_id: questionId,
      p_answer_text: content.answerText ?? null,
      p_code: content.code ?? null,
    },
    "Save answer",
  );
  throwForResult(result, ["saved"]);
  return { status: result.status as StoredAnswerStatus, savedAt: result.savedAt as string, revision: result.revision as number };
}

export type StageSubmitResult = "submitted" | "already_closed";

export async function submitStage(userId: string, assessmentId: string, tier: Tier): Promise<StageSubmitResult> {
  const result = await rpc(
    "submit_assessment_stage",
    { p_assessment_id: assessmentId, p_user_id: userId, p_tier: tier },
    "Submit stage",
  );
  if (result.result === "not_active") sessionError("stage_locked");
  throwForResult(result, ["submitted", "already_closed"]);
  return result.result as StageSubmitResult;
}

export async function recordExecution(
  userId: string,
  assessmentId: string,
  questionId: string,
  type: ExecutionView["type"],
  code: string,
  report: ExecutionReport,
) {
  const result = await rpc(
    "record_code_execution",
    {
      p_assessment_id: assessmentId,
      p_user_id: userId,
      p_question_id: questionId,
      p_execution_type: type,
      p_runtime: report.runtime,
      p_outcome: report.outcome,
      p_passed: report.passed,
      p_total: report.total,
      p_execution_time_ms: report.executionTimeMs,
      p_code: code,
      p_results: toStoredResults(report),
    },
    "Record execution",
  );
  return result.result as "recorded" | "stage_closed" | "already_submitted" | "already_graded" | "answer_not_locked" | "question_not_found";
}

export async function recordAiInteraction(
  userId: string,
  assessmentId: string,
  questionId: string,
  entry: { prompt: string; response: string; guardrail: "passed" | "rewritten" | "blocked"; model: string | null },
) {
  const result = await rpc(
    "record_ai_interaction",
    {
      p_assessment_id: assessmentId,
      p_user_id: userId,
      p_question_id: questionId,
      p_prompt: entry.prompt,
      p_response: entry.response,
      p_guardrail: entry.guardrail,
      p_model: entry.model?.slice(0, 200) ?? null,
    },
    "Record AI interaction",
  );
  return result;
}

// ---------------------------------------------------------------------------
// Server-only reads
// ---------------------------------------------------------------------------

export type QuestionSecrets = {
  tests: TestCase[];
  referenceCode: string[];
  /** Written questions: the rubric's model answer and key points. */
  modelAnswer: string | null;
  keyPoints: string[];
  /** Written questions: the fixed scoring rubric. */
  rubric: WrittenRubric | null;
};

export type WrittenRubric = {
  criteria: { name: string; description: string; points: number }[];
  keyPoints: string[];
  redFlags: string[];
  modelAnswer: string;
};

function parseRubric(criteria: Record<string, unknown> | null | undefined): WrittenRubric | null {
  if (!criteria || criteria.kind !== "written" || !Array.isArray(criteria.criteria)) return null;
  const items = criteria.criteria
    .map((item) => item as { name?: unknown; description?: unknown; points?: unknown })
    .filter((item) => typeof item.name === "string" && typeof item.points === "number" && item.points > 0)
    .map((item) => ({ name: String(item.name), description: String(item.description ?? ""), points: Number(item.points) }));
  if (!items.length) return null;
  const strings = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  return {
    criteria: items,
    keyPoints: strings(criteria.keyPoints),
    redFlags: strings(criteria.redFlags),
    modelAnswer: typeof criteria.modelAnswer === "string" ? criteria.modelAnswer : "",
  };
}

/** Hidden tests, reference code and rubric. Never return these to the client. */
export async function loadQuestionSecrets(questionId: string): Promise<QuestionSecrets> {
  const { data, error } = await createAdminClient()
    .from("assessment_question_secrets")
    .select("reference_files, hidden_tests, grading_criteria")
    .eq("question_id", questionId)
    .maybeSingle<{
      reference_files: { content: string }[];
      hidden_tests: Partial<TestCase>[];
      grading_criteria: { modelAnswer?: unknown; keyPoints?: unknown } & Record<string, unknown>;
    }>();
  if (error) fail("Load question secrets", error);
  if (!data) throw new AssessmentStoreError("Question has no grading data");
  return {
    tests: (data.hidden_tests ?? []).map((test, index) => ({
      name: typeof test.name === "string" ? test.name : `Test ${index + 1}`,
      args: Array.isArray(test.args) ? test.args : [],
      expected: test.expected ?? null,
      expectThrows: test.expectThrows === true,
      hidden: test.hidden === true,
    })),
    referenceCode: (data.reference_files ?? []).map((file) => String(file.content ?? "")),
    modelAnswer: typeof data.grading_criteria?.modelAnswer === "string" ? data.grading_criteria.modelAnswer : null,
    keyPoints: Array.isArray(data.grading_criteria?.keyPoints) ? data.grading_criteria.keyPoints.map(String) : [],
    rubric: parseRubric(data.grading_criteria),
  };
}

/** The question's public examples as test cases, for Run Code. */
export function publicTests(question: PublicQuestion): TestCase[] {
  return question.exampleTests.map((test) => ({ ...test, hidden: false }));
}

export function questionLanguage(question: PublicQuestion): CodeLanguage | null {
  return question.language === "javascript" || question.language === "typescript" || question.language === "python"
    ? question.language
    : null;
}

/** Recent actions by this user, for rate limiting. */
export async function countRecent(table: "code_executions" | "ai_interactions", userId: string, seconds: number, questionId?: string) {
  let query = createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - seconds * 1000).toISOString());
  if (questionId) query = query.eq("question_id", questionId);
  const { count, error } = await query;
  if (error) fail("Count recent activity", error);
  return count ?? 0;
}

/** The latest Run Code result on a question, for the assistant's context. */
export async function latestRun(questionId: string): Promise<ExecutionView | null> {
  const { data, error } = await createAdminClient()
    .from("code_executions")
    .select("question_id, execution_type, outcome, passed_tests, total_tests, execution_time_ms, code_sha256, results, created_at")
    .eq("question_id", questionId)
    .eq("execution_type", "run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ExecutionRow>();
  if (error) fail("Load latest run", error);
  return data ? toExecutionView(data) : null;
}

/** Previous assistant turns on a question, oldest first. */
export async function loadChat(questionId: string, limit = 6): Promise<ChatTurn[]> {
  const { data, error } = await createAdminClient()
    .from("ai_interactions")
    .select("id, candidate_prompt, assistant_response, created_at")
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<{ id: string; candidate_prompt: string; assistant_response: string; created_at: string }[]>();
  if (error) fail("Load assistant history", error);
  return (data ?? [])
    .reverse()
    .map((turn) => ({ id: turn.id, prompt: turn.candidate_prompt, response: turn.assistant_response, createdAt: turn.created_at }));
}

/**
 * Practical answers locked by a stage closing (deadline or stage
 * submission) without a graded submission. Grading them is idempotent: the
 * database keeps one graded submission per question.
 */
export async function findUngradedLockedAnswers(userId: string, assessmentId: string) {
  const admin = createAdminClient();
  const [answers, questions, graded] = await Promise.all([
    admin
      .from("assessment_answers")
      .select("question_id, code")
      .eq("assessment_id", assessmentId)
      .eq("user_id", userId)
      .eq("status", "submitted")
      .not("code", "is", null)
      .returns<{ question_id: string; code: string }[]>(),
    admin
      .from("assessment_questions")
      .select("id, language, entry_point")
      .eq("assessment_id", assessmentId)
      .eq("kind", "practical")
      .returns<{ id: string; language: string | null; entry_point: string | null }[]>(),
    admin
      .from("code_executions")
      .select("question_id")
      .eq("assessment_id", assessmentId)
      .in("execution_type", ["submit", "auto_submit"])
      .returns<{ question_id: string }[]>(),
  ]);
  if (answers.error) fail("Load locked answers", answers.error);
  if (questions.error) fail("Load practical questions", questions.error);
  if (graded.error) fail("Load graded submissions", graded.error);
  const practical = new Map((questions.data ?? []).map((q) => [q.id, q]));
  const done = new Set((graded.data ?? []).map((row) => row.question_id));
  return (answers.data ?? []).flatMap((answer) => {
    const question = practical.get(answer.question_id);
    if (!question || done.has(answer.question_id)) return [];
    return [{ questionId: answer.question_id, code: answer.code, language: question.language, entry: question.entry_point }];
  });
}

/** The candidate-facing view of a fresh execution (public details, hidden counts). */
export function reportToView(type: ExecutionView["type"], report: ExecutionReport): ExecutionView {
  const stored = toStoredResults(report);
  return {
    type,
    outcome: report.outcome,
    passed: report.passed,
    total: report.total,
    executionTimeMs: report.executionTimeMs,
    createdAt: new Date().toISOString(),
    ...stored,
  };
}
