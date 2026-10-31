import type { NextRequest } from "next/server";
import { apiError, isUuid, json, requireUser } from "@/lib/api/http";
import { toPublicAssessment } from "@/lib/assessment/public";
import { startAssessment } from "@/lib/assessment/store";

/**
 * POST /api/assessments/:id/start
 * Starts the 60-minute assessment (started_at, expires_at) with the Novice
 * stage open and reveals its questions. Only a `ready` assessment can
 * start; repeating is a no-op.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/assessments/[id]/start">) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "not_found", "Assessment not found.");

  try {
    const assessment = await startAssessment(guard.userId, id);
    if (!assessment) return apiError(404, "not_found", "Assessment not found.");
    if (assessment.status !== "in_progress") {
      return apiError(409, "not_startable", `This assessment can't be started (status: ${assessment.status}).`);
    }
    return json({ assessment: await toPublicAssessment(assessment) });
  } catch (error) {
    console.error("[assessments] start failed", error);
    return apiError(500, "server_error", "Something went wrong. Please try again.", true);
  }
}
