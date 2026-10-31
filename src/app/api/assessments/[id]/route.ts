import type { NextRequest } from "next/server";
import { apiError, isUuid, json, requireUser } from "@/lib/api/http";
import { toPublicAssessment } from "@/lib/assessment/public";
import { getAssessment } from "@/lib/assessment/store";

/**
 * GET /api/assessments/:id
 * The assessment's status, generation stage and timing, plus its questions' public fields.
 * Before the candidate starts, only the outline (tier, type, minutes) is
 * returned. Reference code, hidden tests and rubrics are never included.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/assessments/[id]">) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "not_found", "Assessment not found.");

  try {
    const assessment = await getAssessment(guard.userId, id);
    if (!assessment) return apiError(404, "not_found", "Assessment not found.");
    // serverTime lets clients count down against the server's clock.
    return json({ assessment: await toPublicAssessment(assessment), serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("[assessments] load failed", error);
    return apiError(500, "server_error", "Something went wrong. Please try again.", true);
  }
}
