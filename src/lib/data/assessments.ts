import "server-only";
import { cache } from "react";
import { toPublicAssessment, type PublicAssessment } from "@/lib/assessment/public";
import {
  findLatestAssessment,
  getAssessment,
  listAssessments,
  refreshAssessmentStatuses,
  type AssessmentHistoryRow,
} from "@/lib/assessment/store";
import { loadAssessmentSession } from "@/lib/assessment/session";
import { getResult, listResults } from "@/lib/grading/results";
import { getCurrentUser } from "@/lib/auth";
import type { AssessmentStatus } from "@/types/database";

// Every reader verifies the session first and scopes to that user's id.
// Readers used for timers also return `serverNow`: the server's clock at
// read time, which countdowns use instead of the device clock.

const refreshStatuses = cache(async (userId: string) => refreshAssessmentStatuses(userId));

/** The signed-in user's assessments, newest first, optionally filtered by status. */
export async function getAssessmentHistory(statuses?: AssessmentStatus[]): Promise<AssessmentHistoryRow[]> {
  const user = await getCurrentUser();
  await refreshStatuses(user.id);
  const rows = await listAssessments(user.id);
  return statuses?.length ? rows.filter((row) => statuses.includes(row.status)) : rows;
}

/** The most recent assessment generated from this résumé, as the candidate may see it. */
export async function getLatestAssessmentForResume(
  resumeId: string,
): Promise<{ assessment: PublicAssessment; serverNow: number } | null> {
  const user = await getCurrentUser();
  await refreshStatuses(user.id);
  const row = await findLatestAssessment(user.id, resumeId);
  return row ? { assessment: await toPublicAssessment(row), serverNow: Date.now() } : null;
}

/** One of the signed-in user's assessments, or null if it isn't theirs. */
export async function getOwnAssessment(assessmentId: string) {
  const user = await getCurrentUser();
  await refreshStatuses(user.id);
  const row = await getAssessment(user.id, assessmentId);
  if (!row) return null;
  return { row, assessment: await toPublicAssessment(row), serverNow: Date.now() };
}

/**
 * The signed-in user's running or finished assessment as the workspace sees
 * it (deadlines applied first). Null when it isn't theirs; `notStarted`
 * when it exists but hasn't been started.
 */
export async function getOwnAssessmentSession(assessmentId: string) {
  const user = await getCurrentUser();
  const session = await loadAssessmentSession(user.id, assessmentId);
  if (session) return { session, notStarted: false as const };
  const row = await getAssessment(user.id, assessmentId);
  return row ? { session: null, notStarted: true as const } : null;
}

/** The signed-in user's report for an assessment (any grading status), with the assessment row. */
export async function getOwnReport(assessmentId: string) {
  const user = await getCurrentUser();
  await refreshStatuses(user.id);
  const row = await getAssessment(user.id, assessmentId);
  if (!row) return null;
  return { row, result: await getResult(user.id, assessmentId) };
}

/** The signed-in user's finished assessments with their grading status and score. */
export async function getReportHistory() {
  const user = await getCurrentUser();
  await refreshStatuses(user.id);
  const [rows, results] = await Promise.all([listAssessments(user.id), listResults(user.id)]);
  return rows
    .filter((row) => row.status === "completed" || row.status === "expired")
    .map((row) => ({ row, result: results.get(row.id) ?? null }));
}
