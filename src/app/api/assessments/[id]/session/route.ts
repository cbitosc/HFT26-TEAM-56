import { after, type NextRequest } from "next/server";
import { apiError, isUuid, json, requireUser } from "@/lib/api/http";
import { sessionErrorResponse } from "@/lib/api/session";
import { gradeLockedAnswers } from "@/lib/assessment/grading";
import { gradeAssessment } from "@/lib/grading/pipeline";
import { loadAssessmentSession } from "@/lib/assessment/session";

// Grading may continue after the response.
export const maxDuration = 300;

/**
 * GET /api/assessments/:id/session
 * The running assessment as the candidate may see it: stage timers, the open
 * stage's four questions (public fields only) and saved work. Passed
 * deadlines are applied first, so this also advances an expired stage.
 * Other stages' questions are never included.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/assessments/[id]/session">) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "not_found", "Assessment not found.");

  try {
    const session = await loadAssessmentSession(guard.userId, id);
    if (!session) return apiError(404, "not_found", "Assessment not found or not started.");
    const userId = guard.userId;
    if (session.status !== "in_progress") {
      // Finished (possibly just now, by the deadline): grade it. Idempotent.
      after(() => gradeAssessment(userId, id));
    } else if (session.stages.some((stage) => stage.status === "submitted" || stage.status === "expired")) {
      after(() => gradeLockedAnswers(userId, id));
    }
    return json({ session });
  } catch (error) {
    return sessionErrorResponse(error, "load session");
  }
}
