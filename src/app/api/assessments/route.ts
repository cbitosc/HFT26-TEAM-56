import { after, type NextRequest } from "next/server";
import { apiError, isUuid, json, requireUser } from "@/lib/api/http";
import { runAssessmentGeneration } from "@/lib/assessment/run";
import {
  GENERATIONS_PER_DAY,
  countRecentGenerations,
  createGeneratingAssessment,
  expireStaleGenerations,
  findActiveAssessment,
} from "@/lib/assessment/store";
import { resumeAnalysisSchema } from "@/lib/resumes/schemas";
import { getLatestAnalyzedResume, getOwnedResume } from "@/lib/resumes/store";

// Generation (three model calls plus sandbox validation) runs after the
// response via after(); this bounds it on platforms that enforce limits.
export const maxDuration = 300;

/**
 * POST /api/assessments   body: { resumeId?: string }
 * Starts generating a personalised assessment for an analysed résumé the
 * user owns (defaults to their latest). Returns 202 { assessmentId, status }.
 * If one is already generating, ready or in progress for that résumé, returns
 * it instead (200), so double clicks and concurrent requests can't duplicate work.
 */
export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;

  let resumeId: string | undefined;
  try {
    const text = await request.text();
    const body = text ? (JSON.parse(text) as { resumeId?: unknown }) : {};
    if (body.resumeId !== undefined) {
      if (typeof body.resumeId !== "string" || !isUuid(body.resumeId)) {
        return apiError(400, "invalid_request", "resumeId must be a UUID.");
      }
      resumeId = body.resumeId;
    }
  } catch {
    return apiError(400, "invalid_request", "Request body must be JSON.");
  }

  try {
    const resume = resumeId ? await getOwnedResume(userId, resumeId) : await getLatestAnalyzedResume(userId);
    if (!resume) {
      return apiError(404, "resume_not_found", "Upload and analyse your résumé first.");
    }
    const analysis = resumeAnalysisSchema.safeParse(resume.analysis);
    if (resume.status !== "analyzed" || !analysis.success) {
      return apiError(409, "resume_not_analyzed", "Your résumé hasn't been analysed yet.");
    }

    await expireStaleGenerations(userId);
    const active = await findActiveAssessment(userId, resume.id);
    if (active) {
      return json({ assessmentId: active.id, status: active.status, reused: true });
    }

    if ((await countRecentGenerations(userId)) >= GENERATIONS_PER_DAY) {
      return apiError(429, "rate_limited", "You've generated several assessments today. Please try again tomorrow.");
    }

    const { assessment, created } = await createGeneratingAssessment(userId, {
      id: resume.id,
      filename: resume.filename,
      domain: analysis.data.profile.primaryDomain,
    });
    if (created) {
      const profile = analysis.data.profile;
      after(() => runAssessmentGeneration(userId, assessment.id, profile));
    }
    return json({ assessmentId: assessment.id, status: assessment.status, reused: !created }, created ? 202 : 200);
  } catch (error) {
    console.error("[assessments] create failed", error);
    return apiError(500, "server_error", "Something went wrong. Please try again.", true);
  }
}
