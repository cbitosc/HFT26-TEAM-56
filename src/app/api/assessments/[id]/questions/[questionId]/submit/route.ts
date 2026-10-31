import { after, type NextRequest } from "next/server";
import { apiError, isUuid, json, parseBody, requireUser } from "@/lib/api/http";
import { acquireExecutionSlot, sessionErrorResponse } from "@/lib/api/session";
import { gradeLockedAnswers } from "@/lib/assessment/grading";
import { codeBody } from "@/lib/assessment/requests";
import {
  countRecent,
  loadQuestionSecrets,
  questionLanguage,
  recordExecution,
  reportToView,
  requireActiveQuestion,
  saveAnswer,
} from "@/lib/assessment/session";
import { ExecutionUnavailableError, executeTests } from "@/lib/execution/execute";

export const maxDuration = 60;

/**
 * POST /api/assessments/:id/questions/:questionId/submit   body: { code }
 * Final submission of a practical question: graded against every test,
 * hidden ones included, then locked. Hidden tests are reported as counts.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/assessments/[id]/questions/[questionId]/submit">,
) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;
  const { id, questionId } = await params;
  if (!isUuid(id) || !isUuid(questionId)) return apiError(404, "not_found", "Question not found.");

  const body = await parseBody(request, codeBody);
  if (body.response) return body.response;

  const release = acquireExecutionSlot(userId);
  if (!release) return apiError(429, "rate_limited", "Your previous run is still going. Wait for it to finish.");
  try {
    const { question, answer } = await requireActiveQuestion(userId, id, questionId);
    const language = questionLanguage(question);
    if (question.kind !== "practical" || !language || !question.entryPoint) {
      return apiError(400, "not_practical", "This question has no code to submit.");
    }
    if (answer?.status === "submitted") {
      return apiError(409, "already_submitted", "This solution has already been submitted.");
    }
    if ((await countRecent("code_executions", userId, 60)) >= 10) {
      return apiError(429, "rate_limited", "You're running code very often. Wait a few seconds and try again.");
    }

    // Saved first, so the graded code is also what's locked if the stage closes meanwhile.
    await saveAnswer(userId, id, questionId, { code: body.data.code });
    const secrets = await loadQuestionSecrets(questionId);
    const report = await executeTests({ language, code: body.data.code, entry: question.entryPoint, tests: secrets.tests });
    const recorded = await recordExecution(userId, id, questionId, "submit", body.data.code, report);

    if (recorded === "stage_closed") {
      after(() => gradeLockedAnswers(userId, id));
      return apiError(409, "stage_closed", "The stage closed before your solution was recorded. Your saved code was locked in and will be graded.");
    }
    if (recorded === "already_submitted" || recorded === "already_graded") {
      return apiError(409, "already_submitted", "This solution has already been submitted.");
    }
    return json({ submission: reportToView("submit", report) });
  } catch (error) {
    if (error instanceof ExecutionUnavailableError) {
      console.error("[assessment] submit unavailable", error);
      return apiError(503, "execution_unavailable", "Code execution is unavailable right now. Your code is saved; try submitting again shortly.", true);
    }
    return sessionErrorResponse(error, "submit solution");
  } finally {
    release();
  }
}
