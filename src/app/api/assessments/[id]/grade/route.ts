import { after, type NextRequest } from "next/server";
import { apiError, isUuid, json, requireUser } from "@/lib/api/http";
import { getAssessment } from "@/lib/assessment/store";
import { gradeAssessment } from "@/lib/grading/pipeline";
import { getResult } from "@/lib/grading/results";

export const maxDuration = 300;

/**
 * POST /api/assessments/:id/grade
 * Retries grading after a failure (or starts it if it's waiting). Submitted
 * answers are untouched; finished steps aren't repeated. Returns 202.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/assessments/[id]/grade">) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "not_found", "Assessment not found.");

  try {
    const assessment = await getAssessment(userId, id);
    if (!assessment) return apiError(404, "not_found", "Assessment not found.");
    if (assessment.status !== "completed" && assessment.status !== "expired") {
      return apiError(409, "not_finished", "Finish the assessment before it can be graded.");
    }
    const result = await getResult(userId, id);
    if (result?.status === "completed") return json({ status: "completed" });
    after(() => gradeAssessment(userId, id, { retry: true }));
    return json({ status: "pending" }, 202);
  } catch (error) {
    console.error("[results] retry failed", error);
    return apiError(500, "server_error", "Something went wrong. Please try again.", true);
  }
}
