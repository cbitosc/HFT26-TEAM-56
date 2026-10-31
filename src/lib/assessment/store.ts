import "server-only";
import { ASSESSMENT_MINUTES, LANGUAGE_FILE, TIER_CONFIG, type GenerationStage } from "@/lib/assessment/config";
import type { GeneratedQuestion } from "@/lib/assessment/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssessmentStatus } from "@/types/database";

// Privileged assessment writes and reads. Every function takes the verified
// user id and scopes its query to it. Secrets (reference code, hidden tests,
// rubrics) are written here and never read back by any candidate-facing path.

/** A generation still marked `generating` after this is treated as failed. */
export const STALE_GENERATION_MS = 10 * 60 * 1000;
export const GENERATIONS_PER_DAY = 5;

export class AssessmentStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AssessmentStoreError";
  }
}

function fail(action: string, error: { message: string }): never {
  throw new AssessmentStoreError(`${action}: ${error.message}`, { cause: error });
}

export type AssessmentRow = {
  id: string;
  user_id: string;
  resume_id: string | null;
  status: AssessmentStatus;
  duration_minutes: number;
  started_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
  failure_reason: string | null;
  generation_stage: GenerationStage | null;
  resume_filename: string | null;
  technical_domain: string | null;
};

const ASSESSMENT_COLUMNS =
  "id, user_id, resume_id, status, duration_minutes, started_at, expires_at, completed_at, created_at, failure_reason, generation_stage, resume_filename, technical_domain";

export async function expireStaleGenerations(userId: string) {
  const cutoff = new Date(Date.now() - STALE_GENERATION_MS).toISOString();
  const { error } = await createAdminClient()
    .from("assessments")
    .update({ status: "failed", generation_stage: null, failure_reason: "Generation took too long and was stopped." })
    .eq("user_id", userId)
    .eq("status", "generating")
    .lt("created_at", cutoff);
  if (error) fail("Expire stale generations", error);
}

export async function countRecentGenerations(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await createAdminClient()
    .from("assessments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) fail("Count generations", error);
  return count ?? 0;
}

/** An assessment for this résumé that is generating, ready or underway. */
export async function findActiveAssessment(userId: string, resumeId: string) {
  const { data, error } = await createAdminClient()
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("resume_id", resumeId)
    .in("status", ["generating", "ready", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AssessmentRow>();
  if (error) fail("Find active assessment", error);
  return data;
}

/**
 * Inserts the assessment in `generating`. The partial unique index allows one
 * generating row per résumé, so a concurrent request gets the existing one.
 */
export async function createGeneratingAssessment(
  userId: string,
  resume: { id: string; filename: string; domain: string },
) {
  const resumeId = resume.id;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("assessments")
    .insert({
      user_id: userId,
      resume_id: resumeId,
      resume_filename: resume.filename.slice(0, 255),
      technical_domain: resume.domain.slice(0, 200) || null,
      status: "generating",
      generation_stage: "analyzing",
      duration_minutes: ASSESSMENT_MINUTES,
    })
    .select(ASSESSMENT_COLUMNS)
    .single<AssessmentRow>();

  if (!error) return { assessment: data, created: true };
  if (error.code === "23505") {
    const existing = await findActiveAssessment(userId, resumeId);
    if (existing) return { assessment: existing, created: false };
  }
  fail("Create assessment", error);
}

/** The most recent assessment for this résumé, in any status. */
export async function findLatestAssessment(userId: string, resumeId: string) {
  const { data, error } = await createAdminClient()
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AssessmentRow>();
  if (error) fail("Find latest assessment", error);
  return data;
}

export async function getAssessment(userId: string, assessmentId: string) {
  const { data, error } = await createAdminClient()
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("id", assessmentId)
    .maybeSingle<AssessmentRow>();
  if (error) fail("Load assessment", error);
  return data;
}

/** Records progress for the candidate's progress view. Only while generating. */
export async function setGenerationStage(userId: string, assessmentId: string, stage: GenerationStage) {
  const { error } = await createAdminClient()
    .from("assessments")
    .update({ generation_stage: stage })
    .eq("user_id", userId)
    .eq("id", assessmentId)
    .eq("status", "generating");
  if (error) fail("Update generation stage", error);
}

export type AssessmentHistoryRow = AssessmentRow & { question_count: number };

/** The user's assessments, newest first, with how many questions each has. */
export async function listAssessments(userId: string): Promise<AssessmentHistoryRow[]> {
  // Server-side read: question content is hidden by RLS before the start, but
  // the count isn't sensitive. Only the count is selected, never any content.
  const { data, error } = await createAdminClient()
    .from("assessments")
    .select(`${ASSESSMENT_COLUMNS}, assessment_questions(count)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<(AssessmentRow & { assessment_questions: { count: number }[] })[]>();
  if (error) fail("List assessments", error);
  return (data ?? []).map(({ assessment_questions, ...row }) => ({
    ...row,
    question_count: assessment_questions[0]?.count ?? 0,
  }));
}

export async function markGenerationFailed(userId: string, assessmentId: string, reason: string) {
  const { error } = await createAdminClient()
    .from("assessments")
    .update({ status: "failed", generation_stage: null, failure_reason: reason.slice(0, 500) })
    .eq("user_id", userId)
    .eq("id", assessmentId)
    .eq("status", "generating");
  if (error) fail("Mark assessment failed", error);
}

/**
 * Persists validated questions: public fields to assessment_questions,
 * reference code, the full test suite and rubrics to
 * assessment_question_secrets, and the assessment to `ready`, atomically.
 */
export async function saveGeneratedQuestions(
  userId: string,
  assessmentId: string,
  questions: GeneratedQuestion[],
) {
  const admin = createAdminClient();
  const rows = questions.map((question, index) => ({ id: crypto.randomUUID(), question, index }));

  const publicRows = rows.map(({ id, question, index }) => ({
    id,
    assessment_id: assessmentId,
    tier: question.tier,
    difficulty: question.difficulty,
    question_type: question.type,
    kind: question.kind,
    title: question.title,
    description: question.statement,
    resume_evidence: question.resumeEvidence,
    skills_tested: question.skillsTested,
    time_allocation_minutes: question.timeMinutes,
    display_order: index,
    ai_assistance: TIER_CONFIG[question.tier].aiAssistance,
    ...(question.kind === "practical"
      ? {
          language: question.language,
          entry_point: question.entryFunction,
          starter_files: [{ path: LANGUAGE_FILE[question.language], content: question.starterCode }],
          example_tests: question.tests
            .filter((test) => !test.hidden)
            .map(({ name, args, expected, expectThrows }) => ({ name, args, expected, expectThrows })),
        }
      : { language: null, entry_point: null, starter_files: [], example_tests: [] }),
  }));

  const secretRows = rows.map(({ id, question }) => ({
    question_id: id,
    reference_files:
      question.kind === "practical"
        ? [{ path: LANGUAGE_FILE[question.language], content: question.referenceCode }]
        : [],
    hidden_tests: question.kind === "practical" ? question.tests : [],
    grading_criteria:
      question.kind === "practical"
        ? { kind: "practical", notes: question.gradingNotes, source: question.source }
        : { kind: "written", ...question.rubric },
    validation_report: question.kind === "practical" ? question.validation : null,
  }));

  // One transaction: questions, secrets and the `ready` flip, with the
  // 12-question / 4-per-tier structure re-checked by the database.
  const { error } = await admin.rpc("save_generated_assessment", {
    p_assessment_id: assessmentId,
    p_user_id: userId,
    p_questions: publicRows,
    p_secrets: secretRows,
  });
  if (error?.code === "P0002") throw new AssessmentStoreError("Assessment is no longer generating");
  if (error) fail("Save generated assessment", error);
}

/** Tier/type/minutes only: what a candidate may see before starting. */
export async function getAssessmentStructure(assessmentId: string) {
  const { data, error } = await createAdminClient()
    .from("assessment_questions")
    .select("tier, kind, question_type, language, time_allocation_minutes, ai_assistance, display_order")
    .eq("assessment_id", assessmentId)
    .order("display_order");
  if (error) fail("Load assessment structure", error);
  return data ?? [];
}

/**
 * Starts the timer: `ready` -> `in_progress`, with started_at and expires_at
 * set by the database clock in one atomic update. Starting twice, or racing
 * another start, returns the current state without moving the deadline.
 */
export async function startAssessment(userId: string, assessmentId: string) {
  const { data, error } = await createAdminClient()
    .rpc("start_assessment", { p_assessment_id: assessmentId, p_user_id: userId })
    .select(ASSESSMENT_COLUMNS)
    .maybeSingle<AssessmentRow>();
  if (error) fail("Start assessment", error);
  return data ?? (await getAssessment(userId, assessmentId));
}

/** In-progress assessments past their deadline become `expired` (database clock). */
export async function expireOverdueAssessments(userId: string) {
  const { error } = await createAdminClient().rpc("expire_overdue_assessments", { p_user_id: userId });
  if (error) fail("Expire overdue assessments", error);
}

/** Persists time-based transitions (stuck generations, passed deadlines) before a read. */
export async function refreshAssessmentStatuses(userId: string) {
  await Promise.all([expireStaleGenerations(userId), expireOverdueAssessments(userId)]);
}
