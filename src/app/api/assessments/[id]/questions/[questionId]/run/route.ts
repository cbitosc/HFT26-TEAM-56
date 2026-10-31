import type { NextRequest } from "next/server";
import { apiError, isUuid, json, parseBody, requireUser } from "@/lib/api/http";
import { acquireExecutionSlot, sessionErrorResponse } from "@/lib/api/session";
import { codeBody } from "@/lib/assessment/requests";
import {
  countRecent,
  publicTests,
  questionLanguage,
  recordExecution,
  reportToView,
  requireActiveQuestion,
  saveAnswer,
} from "@/lib/assessment/session";
import { ExecutionUnavailableError, executeTests } from "@/lib/execution/execute";

// A sandbox run takes a few seconds at most; this leaves room for queueing.
export const maxDuration = 60;

const RUNS_PER_MINUTE = 10;

/**
 * POST /api/assessments/:id/questions/:questionId/run   body: { code }
 * Saves the code, then runs it in the sandbox against the question's public
 * examples. Only for a practical question in the open stage.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/assessments/[id]/questions/[questionId]/run">) {
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
      return apiError(400, "not_practical", "This question has no code to run.");
    }
    if (answer?.status === "submitted") {
      return apiError(409, "answer_locked", "This solution has already been submitted.");
    }
    if ((await countRecent("code_executions", userId, 60)) >= RUNS_PER_MINUTE) {
      return apiError(429, "rate_limited", "You're running code very often. Wait a few seconds and try again.");
    }

    await saveAnswer(userId, id, questionId, { code: body.data.code });
    const report = await executeTests({ language, code: body.data.code, entry: question.entryPoint, tests: publicTests(question) });
    await recordExecution(userId, id, questionId, "run", body.data.code, report);
    return json({ run: reportToView("run", report) });
  } catch (error) {
    if (error instanceof ExecutionUnavailableError) {
      console.error("[assessment] run unavailable", error);
      return apiError(503, "execution_unavailable", "Code execution is unavailable right now. Your code is saved; try again shortly.", true);
    }
    return sessionErrorResponse(error, "run code");
  } finally {
    release();
  }
}
