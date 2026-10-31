import "server-only";
import { AssessmentStoreError } from "@/lib/assessment/store";
import type { Report } from "@/lib/grading/report";
import { createAdminClient } from "@/lib/supabase/admin";

// Reading stored reports. Every function scopes to the verified user id.
// Reports hold only candidate-safe data (see report.ts).

export type ResultStatus = "pending" | "grading" | "completed" | "failed";

export type StoredResult = {
  assessmentId: string;
  status: ResultStatus;
  failureReason: string | null;
  attempts: number;
  /** True when a grading worker's lease has lapsed (it died); a new trigger resumes it. */
  stale: boolean;
  completedAt: string | null;
  /** Only once grading has completed. */
  report: Omit<Report, "recommendations"> & { recommendations: string[] } | null;
};

type ResultRow = {
  assessment_id: string;
  status: ResultStatus;
  failure_reason: string | null;
  attempts: number;
  lease_expires_at: string | null;
  completed_at: string | null;
  scoring_version: number | null;
  correctness_score: number | string | null;
  performance_score: number | string | null;
  ai_efficiency_score: number | string | null;
  final_score: number | string | null;
  classification: Report["classification"] | null;
  summary: Report["summary"];
  score_breakdown: Report["scoreBreakdown"];
  stage_results: Report["stageResults"];
  question_results: Report["questionResults"];
  skills_verification: Report["skillsVerification"];
  ai_usage: Report["aiUsage"];
  recommendations: string[];
};

const COLUMNS =
  "assessment_id, status, failure_reason, attempts, lease_expires_at, completed_at, scoring_version, correctness_score, performance_score, ai_efficiency_score, final_score, classification, summary, score_breakdown, stage_results, question_results, skills_verification, ai_usage, recommendations";

const num = (value: number | string | null) => (value === null ? 0 : Number(value));

export function toStoredResult(row: ResultRow): StoredResult {
  const completed = row.status === "completed";
  return {
    assessmentId: row.assessment_id,
    status: row.status,
    failureReason: row.failure_reason,
    attempts: row.attempts,
    stale: row.status === "grading" && !!row.lease_expires_at && new Date(row.lease_expires_at).getTime() < Date.now(),
    completedAt: row.completed_at,
    // No score is shown until grading has actually completed.
    report: completed
      ? {
          scoringVersion: row.scoring_version ?? 1,
          correctnessScore: num(row.correctness_score),
          performanceScore: num(row.performance_score),
          aiEfficiencyScore: num(row.ai_efficiency_score),
          finalScore: num(row.final_score),
          classification: row.classification ?? "needs_improvement",
          summary: row.summary,
          scoreBreakdown: row.score_breakdown,
          stageResults: row.stage_results,
          questionResults: row.question_results,
          skillsVerification: row.skills_verification,
          aiUsage: row.ai_usage,
          recommendations: row.recommendations,
        }
      : null,
  };
}

export async function getResult(userId: string, assessmentId: string): Promise<StoredResult | null> {
  const { data, error } = await createAdminClient()
    .from("assessment_results")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("assessment_id", assessmentId)
    .maybeSingle<ResultRow>();
  if (error) throw new AssessmentStoreError(`Load result: ${error.message}`, { cause: error });
  return data ? toStoredResult(data) : null;
}

export type ResultListItem = {
  assessmentId: string;
  status: ResultStatus;
  finalScore: number | null;
  classification: Report["classification"] | null;
  completedAt: string | null;
};

export async function listResults(userId: string): Promise<Map<string, ResultListItem>> {
  const { data, error } = await createAdminClient()
    .from("assessment_results")
    .select("assessment_id, status, final_score, classification, completed_at")
    .eq("user_id", userId)
    .returns<{ assessment_id: string; status: ResultStatus; final_score: number | string | null; classification: Report["classification"] | null; completed_at: string | null }[]>();
  if (error) throw new AssessmentStoreError(`List results: ${error.message}`, { cause: error });
  return new Map(
    (data ?? []).map((row) => [
      row.assessment_id,
      {
        assessmentId: row.assessment_id,
        status: row.status,
        finalScore: row.status === "completed" && row.final_score !== null ? Number(row.final_score) : null,
        classification: row.status === "completed" ? row.classification : null,
        completedAt: row.completed_at,
      },
    ]),
  );
}

/** Whether a background grading run should be started for this result. */
export function needsGrading(result: StoredResult | null) {
  return !result || result.status === "pending" || result.stale;
}
