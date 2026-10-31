import "server-only";
import { createHash } from "node:crypto";
import { generateStructured } from "@/lib/ai/client";
import { TIERS, type CodeLanguage, type Tier } from "@/lib/assessment/config";
import { loadQuestionSecrets, recordExecution, toExecutionView } from "@/lib/assessment/session";
import { firstQuestionNumber } from "@/lib/assessment/stages";
import { AssessmentStoreError } from "@/lib/assessment/store";
import { ExecutionUnavailableError, executeTests } from "@/lib/execution/execute";
import { buildReport, type GradingQuestion } from "@/lib/grading/report";
import { evaluateWrittenAnswer, type StructuredCall, type WrittenEvaluation } from "@/lib/grading/written";
import { resumeAnalysisSchema } from "@/lib/resumes/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

// The grading pipeline, run in the background once an assessment is
// finished. Durable by design: progress lives in the database, not in the
// request. A lease (claim_assessment_grading) makes one worker grade at a
// time; if a worker dies, the lease expires and the next trigger (the
// candidate's results page, the cron sweep) resumes. Each step is idempotent:
// coding submissions are graded once (unique per question) and written
// evaluations are reused while the answer is unchanged, so a retry never
// double-charges or changes an already-recorded grade.

export type GradeOutcome = "completed" | "in_progress" | "failed" | "not_finished" | "not_found";

const WRITTEN_CONCURRENCY = 3;

function fail(action: string, error: { message: string }): never {
  throw new AssessmentStoreError(`${action}: ${error.message}`, { cause: error });
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** Failures the candidate can act on or that a later retry fixes; shown on the results page. */
function failureReason(error: unknown) {
  if (error instanceof ExecutionUnavailableError) return "Code execution is unavailable right now, so coding answers couldn't be graded. Retry shortly.";
  if (error instanceof Error && error.name === "AiError") return "The written-answer evaluator is unavailable right now. Retry shortly.";
  if (error instanceof Error && error.name === "RubricMismatchError") return "A written answer couldn't be evaluated reliably. Retry to evaluate it again.";
  return "Grading hit an unexpected error. Your answers are safe; retry to grade them again.";
}

type QuestionRow = {
  id: string;
  tier: Tier;
  difficulty: string;
  kind: "practical" | "written";
  question_type: string;
  title: string;
  description: string;
  skills_tested: string[];
  language: string | null;
  entry_point: string | null;
  starter_files: { path: string; content: string }[];
  display_order: number;
};

type ExecutionRow = Parameters<typeof toExecutionView>[0] & { id: string };

async function loadData(userId: string, assessmentId: string) {
  const admin = createAdminClient();
  const [assessment, questions, answers, stages, executions, hints] = await Promise.all([
    admin
      .from("assessments")
      .select("status, started_at, completed_at, resume_id")
      .eq("id", assessmentId)
      .eq("user_id", userId)
      .single<{ status: string; started_at: string | null; completed_at: string | null; resume_id: string | null }>(),
    admin
      .from("assessment_questions")
      .select("id, tier, difficulty, kind, question_type, title, description, skills_tested, language, entry_point, starter_files, display_order")
      .eq("assessment_id", assessmentId)
      .order("display_order")
      .returns<QuestionRow[]>(),
    admin
      .from("assessment_answers")
      .select("question_id, answer_text, code")
      .eq("assessment_id", assessmentId)
      .returns<{ question_id: string; answer_text: string | null; code: string | null }[]>(),
    admin
      .from("assessment_stages")
      .select("tier, status, started_at, submitted_at")
      .eq("assessment_id", assessmentId)
      .returns<{ tier: Tier; status: string; started_at: string | null; submitted_at: string | null }[]>(),
    loadExecutions(assessmentId),
    admin
      .from("ai_interactions")
      .select("question_id, created_at")
      .eq("assessment_id", assessmentId)
      .returns<{ question_id: string; created_at: string }[]>(),
  ]);
  for (const [name, result] of Object.entries({ assessment, questions, answers, stages, hints })) {
    if (result.error) fail(`Load ${name}`, result.error);
  }
  return {
    assessment: assessment.data!,
    questions: questions.data ?? [],
    answers: new Map((answers.data ?? []).map((a) => [a.question_id, a])),
    stages: stages.data ?? [],
    executions,
    hints: hints.data ?? [],
  };
}

async function loadExecutions(assessmentId: string) {
  const { data, error } = await createAdminClient()
    .from("code_executions")
    .select("id, question_id, execution_type, outcome, passed_tests, total_tests, execution_time_ms, code_sha256, results, created_at")
    .eq("assessment_id", assessmentId)
    .order("created_at")
    .returns<ExecutionRow[]>();
  if (error) fail("Load executions", error);
  return data ?? [];
}

async function loadClaimedSkills(resumeId: string | null) {
  if (!resumeId) return [];
  const { data, error } = await createAdminClient().from("resumes").select("analysis").eq("id", resumeId).maybeSingle<{ analysis: unknown }>();
  if (error || !data) return [];
  const parsed = resumeAnalysisSchema.safeParse(data.analysis);
  if (!parsed.success) return [];
  const { programmingLanguages, frameworksAndLibraries, databases, developerTools } = parsed.data.profile;
  return [...programmingLanguages, ...frameworksAndLibraries, ...databases, ...developerTools];
}

function isAttempted(question: QuestionRow, answer: { answer_text: string | null; code: string | null } | undefined) {
  if (!answer) return false;
  if (question.kind === "written") return Boolean(answer.answer_text?.trim());
  const code = answer.code ?? "";
  // Unchanged starter code isn't an attempt (for debugging tasks it would pass some tests by itself).
  return Boolean(code.trim()) && code.trim() !== (question.starter_files[0]?.content ?? "").trim();
}

/** Grades locked code that has no graded submission yet (deterministic, tests only). */
async function gradeCoding(userId: string, assessmentId: string, data: Awaited<ReturnType<typeof loadData>>) {
  const graded = new Set(data.executions.filter((e) => e.execution_type !== "run").map((e) => e.question_id));
  for (const question of data.questions) {
    const answer = data.answers.get(question.id);
    if (question.kind !== "practical" || graded.has(question.id) || !isAttempted(question, answer)) continue;
    if (!question.language || !question.entry_point) continue;
    const secrets = await loadQuestionSecrets(question.id);
    const code = answer!.code!;
    const report = await executeTests({ language: question.language as CodeLanguage, code, entry: question.entry_point, tests: secrets.tests });
    await recordExecution(userId, assessmentId, question.id, "auto_submit", code, report);
  }
}

async function runLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await task(queue.shift()!);
    }),
  );
}

/** Rubric evaluation of every answered written question, reusing stored evaluations of the same answer. */
async function gradeWritten(userId: string, assessmentId: string, data: Awaited<ReturnType<typeof loadData>>, call: StructuredCall) {
  const admin = createAdminClient();
  const written = data.questions.filter((q) => q.kind === "written" && isAttempted(q, data.answers.get(q.id)));
  const { data: stored, error } = await admin
    .from("written_evaluations")
    .select("question_id, answer_sha256, evaluation")
    .eq("assessment_id", assessmentId)
    .returns<{ question_id: string; answer_sha256: string; evaluation: WrittenEvaluation }[]>();
  if (error) fail("Load written evaluations", error);
  const evaluations = new Map<string, WrittenEvaluation>();
  const existing = new Map((stored ?? []).map((row) => [row.question_id, row]));

  await runLimited(written, WRITTEN_CONCURRENCY, async (question) => {
    const answer = data.answers.get(question.id)!.answer_text!;
    const hash = sha256(answer);
    const previous = existing.get(question.id);
    if (previous && previous.answer_sha256 === hash) {
      evaluations.set(question.id, previous.evaluation);
      return;
    }
    const secrets = await loadQuestionSecrets(question.id);
    if (!secrets.rubric) throw new AssessmentStoreError(`Question ${question.id} has no rubric`);
    // Only the question, rubric and answer are sent: no name, email or résumé.
    const { evaluation, model } = await evaluateWrittenAnswer(
      { questionId: question.id, title: question.title, type: question.question_type, statement: question.description, rubric: secrets.rubric, answer },
      call,
    );
    const { error: saveError } = await admin.from("written_evaluations").upsert({
      question_id: question.id,
      assessment_id: assessmentId,
      user_id: userId,
      answer_sha256: hash,
      model,
      rubric: secrets.rubric,
      evaluation,
      score: evaluation.score,
      max_score: evaluation.maxScore,
    });
    if (saveError) fail("Save written evaluation", saveError);
    evaluations.set(question.id, evaluation);
  });
  return evaluations;
}

const defaultStructuredCall: StructuredCall = (request) => generateStructured(request);

/**
 * Grades a finished assessment and stores its report. Safe to call any number
 * of times from anywhere: returns at once if it's done or someone else is
 * grading. `retry` re-runs a failed grading.
 */
export async function gradeAssessment(
  userId: string,
  assessmentId: string,
  options: { retry?: boolean; structuredCall?: StructuredCall } = {},
): Promise<GradeOutcome> {
  const admin = createAdminClient();
  const { data: claim, error: claimError } = await admin.rpc("claim_assessment_grading", {
    p_assessment_id: assessmentId,
    p_user_id: userId,
    p_retry: options.retry ?? false,
  });
  if (claimError) fail("Claim grading", claimError);
  const { result, attempt } = claim as { result: string; attempt?: number };
  if (result !== "claimed") return result as GradeOutcome;

  try {
    let data = await loadData(userId, assessmentId);
    await gradeCoding(userId, assessmentId, data);
    data = { ...data, executions: await loadExecutions(assessmentId) };
    const evaluations = await gradeWritten(userId, assessmentId, data, options.structuredCall ?? defaultStructuredCall);

    const hintsByQuestion = new Map<string, { createdAt: string }[]>();
    for (const hint of data.hints) {
      (hintsByQuestion.get(hint.question_id) ?? hintsByQuestion.set(hint.question_id, []).get(hint.question_id)!).push({ createdAt: hint.created_at });
    }
    const questions: GradingQuestion[] = data.questions.map((question) => {
      const indexInTier = data.questions.filter((q) => q.tier === question.tier).indexOf(question);
      return {
        id: question.id,
        number: firstQuestionNumber(question.tier) + indexInTier,
        tier: question.tier,
        difficulty: question.difficulty,
        type: question.question_type,
        kind: question.kind,
        title: question.title,
        skillsTested: question.skills_tested,
        language: question.language,
        attempted: isAttempted(question, data.answers.get(question.id)),
        executions: data.executions
          .filter((e) => e.question_id === question.id)
          .map((e) => {
            const view = toExecutionView(e);
            return { type: view.type, outcome: view.outcome, passed: view.passed, total: view.total, createdAt: view.createdAt, hidden: view.hidden };
          }),
        hints: hintsByQuestion.get(question.id) ?? [],
        evaluation: evaluations.get(question.id) ?? null,
      };
    });

    const report = buildReport({
      assessment: { status: data.assessment.status, startedAt: data.assessment.started_at, completedAt: data.assessment.completed_at },
      questions,
      stages: TIERS.map((tier) => {
        const stage = data.stages.find((s) => s.tier === tier);
        return { tier, status: stage?.status ?? "expired", startedAt: stage?.started_at ?? null, submittedAt: stage?.submitted_at ?? null };
      }),
      claimedSkills: await loadClaimedSkills(data.assessment.resume_id),
    });

    const { data: stored, error } = await admin.rpc("complete_assessment_grading", {
      p_assessment_id: assessmentId,
      p_user_id: userId,
      p_attempt: attempt,
      p_report: report,
    });
    if (error) fail("Save report", error);
    // Not stored means a newer attempt took over; its result stands.
    return stored ? "completed" : "in_progress";
  } catch (error) {
    console.error(`[grading] ${assessmentId} attempt ${attempt} failed`, error);
    await admin
      .rpc("fail_assessment_grading", { p_assessment_id: assessmentId, p_user_id: userId, p_attempt: attempt, p_reason: failureReason(error) })
      .then(({ error: failError }) => failError && console.error("[grading] could not record failure", failError));
    return "failed";
  }
}

/** Grading that's waiting or whose worker died, for the cron sweep. */
export async function findPendingGradings(limit = 5) {
  const admin = createAdminClient();
  const columns = "assessment_id, user_id";
  const [pending, stale] = await Promise.all([
    admin.from("assessment_results").select(columns).eq("status", "pending").order("created_at").limit(limit),
    admin
      .from("assessment_results")
      .select(columns)
      .eq("status", "grading")
      .lt("lease_expires_at", new Date().toISOString())
      .order("created_at")
      .limit(limit),
  ]);
  if (pending.error) fail("Find pending gradings", pending.error);
  if (stale.error) fail("Find stale gradings", stale.error);
  return [...(pending.data ?? []), ...(stale.data ?? [])].slice(0, limit) as { assessment_id: string; user_id: string }[];
}
