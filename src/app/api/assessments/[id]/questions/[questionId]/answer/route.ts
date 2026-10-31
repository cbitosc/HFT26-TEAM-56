import type { NextRequest } from "next/server";
import { apiError, isUuid, json, parseBody, requireUser } from "@/lib/api/http";
import { sessionErrorResponse } from "@/lib/api/session";
import { saveAnswerBody } from "@/lib/assessment/requests";
import { saveAnswer } from "@/lib/assessment/session";

/**
 * PUT /api/assessments/:id/questions/:questionId/answer   body: { answerText } | { code }
 * Autosave. The database accepts it only while the question's stage is open
 * and the answer isn't locked, by its own clock.
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteContext<"/api/assessments/[id]/questions/[questionId]/answer">,
) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { id, questionId } = await params;
  if (!isUuid(id) || !isUuid(questionId)) return apiError(404, "not_found", "Question not found.");

  const body = await parseBody(request, saveAnswerBody);
  if (body.response) return body.response;

  try {
    return json(await saveAnswer(guard.userId, id, questionId, body.data));
  } catch (error) {
    return sessionErrorResponse(error, "save answer");
  }
}
