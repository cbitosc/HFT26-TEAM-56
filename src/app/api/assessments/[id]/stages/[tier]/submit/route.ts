import { after, type NextRequest } from "next/server";
import { apiError, isUuid, json, parseBody, requireUser } from "@/lib/api/http";
import { sessionErrorResponse } from "@/lib/api/session";
import { gradeLockedAnswers } from "@/lib/assessment/grading";
import { gradeAssessment } from "@/lib/grading/pipeline";
import { stageSubmitBody, tierParam } from "@/lib/assessment/requests";
import { SessionError, loadAssessmentSession, saveAnswer, submitStage } from "@/lib/assessment/session";

export const maxDuration = 300;

/**
 * POST /api/assessments/:id/stages/:tier/submit   body: { answers?: [{ questionId, answerText | code }] }
 * Saves any pending edits, then closes the stage: its answers lock and the
 * next stage opens immediately (submitting Master completes the assessment).
 * Repeating it is harmless. Returns the new session.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/assessments/[id]/stages/[tier]/submit">) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;
  const { id, tier: rawTier } = await params;
  const tier = tierParam.safeParse(rawTier);
  if (!isUuid(id) || !tier.success) return apiError(404, "not_found", "Stage not found.");

  const body = await parseBody(request, stageSubmitBody);
  if (body.response) return body.response;

  try {
    for (const { questionId, ...content } of body.data.answers ?? []) {
      try {
        await saveAnswer(userId, id, questionId, content);
      } catch (error) {
        // A stage that already closed keeps what was saved; anything else stops the submission.
        if (!(error instanceof SessionError) || !["stage_closed", "answer_locked", "assessment_closed"].includes(error.code)) throw error;
      }
    }

    const result = await submitStage(userId, id, tier.data);
    const session = await loadAssessmentSession(userId, id);
    // Submitting Master finishes the assessment: grade everything.
    after(async () => {
      if (session && session.status !== "in_progress") await gradeAssessment(userId, id);
      else await gradeLockedAnswers(userId, id);
    });
    return json({ result, session });
  } catch (error) {
    return sessionErrorResponse(error, "submit stage");
  }
}
