import { after, type NextRequest } from "next/server";
import { apiError, isUuid, json, requireUser } from "@/lib/api/http";
import { sessionErrorResponse } from "@/lib/api/session";
import { gradeAssessment } from "@/lib/grading/pipeline";
import { loadAssessmentSession, submitStage } from "@/lib/assessment/session";

export const maxDuration = 300;

/**
 * POST /api/assessments/:id/complete
 * Finalises the assessment by submitting the Master stage. Only possible
 * once Master is open; calling it on a finished assessment returns it unchanged.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/assessments/[id]/complete">) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "not_found", "Assessment not found.");

  try {
    const session = await loadAssessmentSession(userId, id);
    if (!session) return apiError(404, "not_found", "Assessment not found or not started.");
    if (session.status !== "in_progress") {
      after(() => gradeAssessment(userId, id));
      return json({ result: "already_closed", session });
    }
    if (session.currentTier !== "master") {
      return apiError(409, "stage_order", "Finish the earlier stages first.");
    }
    const result = await submitStage(userId, id, "master");
    after(() => gradeAssessment(userId, id));
    return json({ result, session: await loadAssessmentSession(userId, id) });
  } catch (error) {
    return sessionErrorResponse(error, "complete assessment");
  }
}
