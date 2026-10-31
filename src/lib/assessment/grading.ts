import "server-only";
import type { CodeLanguage } from "@/lib/assessment/config";
import { findUngradedLockedAnswers, loadQuestionSecrets, recordExecution } from "@/lib/assessment/session";
import { executeTests } from "@/lib/execution/execute";

/**
 * Grades practical answers that were locked when their stage closed (by the
 * deadline, or by submitting the stage) without an explicit Submit
 * Solution. Runs after the response; never throws. Deterministic and
 * idempotent: the same locked code against the same tests, recorded once.
 */
export async function gradeLockedAnswers(userId: string, assessmentId: string) {
  try {
    const pending = await findUngradedLockedAnswers(userId, assessmentId);
    for (const answer of pending) {
      if (!answer.language || !answer.entry) continue;
      try {
        const secrets = await loadQuestionSecrets(answer.questionId);
        const report = await executeTests({
          language: answer.language as CodeLanguage,
          code: answer.code,
          entry: answer.entry,
          tests: secrets.tests,
        });
        await recordExecution(userId, assessmentId, answer.questionId, "auto_submit", answer.code, report);
      } catch (error) {
        // Left ungraded; the next stage transition or sweep retries it.
        console.error(`[grading] ${assessmentId}/${answer.questionId} not graded`, error);
      }
    }
  } catch (error) {
    console.error(`[grading] ${assessmentId} lookup failed`, error);
  }
}
