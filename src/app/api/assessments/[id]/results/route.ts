import { after, type NextRequest } from "next/server";
import { apiError, isUuid, json, requireUser } from "@/lib/api/http";
import { getAssessment } from "@/lib/assessment/store";
import { gradeAssessment } from "@/lib/grading/pipeline";
import { getResult, needsGrading } from "@/lib/grading/results";

// Grading (sandbox runs and model calls) continues after the response.
export const maxDuration = 300;

/**
 * GET /api/assessments/:id/results
 * Grading status and, once completed, the report. Starts or resumes grading
 * of a finished assessment that's waiting or whose worker died.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/assessments/[id]/results">) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "not_found", "Assessment not found.");

  try {
    const assessment = await getAssessment(userId, id);
    if (!assessment) return apiError(404, "not_found", "Assessment not found.");
    const result = await getResult(userId, id);
    const finished = assessment.status === "completed" || assessment.status === "expired";
    if (!finished && !result) {
      return json({ status: "not_finished", report: null, failureReason: null });
    }
    if (needsGrading(result)) after(() => gradeAssessment(userId, id));
    return json({
      // A lapsed lease is being restarted above, so it reads as pending.
      status: !result || result.stale ? "pending" : result.status,
      failureReason: result?.failureReason ?? null,
      report: result?.report ?? null,
    });
  } catch (error) {
    console.error("[results] load failed", error);
    return apiError(500, "server_error", "Something went wrong. Please try again.", true);
  }
}
