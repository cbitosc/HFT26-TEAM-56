import type { NextRequest } from "next/server";
import { AiError } from "@/lib/ai/client";
import { apiError, isUuid, json, requireUser } from "@/lib/api/http";
import {
  analyzeResume,
  buildAnalysisRecord,
  prepareResumeText,
  skillCount,
  validateResume,
  verdictFrom,
} from "@/lib/resumes/analyze";
import { RESUME_ERROR_MESSAGES as MESSAGES } from "@/lib/resumes/messages";
import { resumeAnalysisSchema } from "@/lib/resumes/schemas";
import {
  claimForAnalysis,
  deleteOtherResumes,
  deleteResume,
  getOwnedResume,
  markAnalyzed,
  markFailed,
} from "@/lib/resumes/store";

// Two model calls; leave room on platforms with short default limits.
export const maxDuration = 120;

/**
 * POST /api/resumes/:id/analyze
 * Validates the stored résumé text with the model, then extracts the
 * structured profile and saves it. Idempotent once analysed.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/resumes/[id]/analyze">,
) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "not_found", MESSAGES.not_found);

  let claimed = false;
  try {
    const resume = await getOwnedResume(userId, id);
    if (!resume) return apiError(404, "not_found", MESSAGES.not_found);

    if (resume.status === "analyzed") {
      const analysis = resumeAnalysisSchema.safeParse(resume.analysis);
      if (analysis.success) return json({ resumeId: id, analysis: analysis.data });
    }

    claimed = await claimForAnalysis(userId, id);
    if (!claimed) {
      return apiError(409, "analysis_in_progress", MESSAGES.analysis_in_progress, true);
    }

    const text = prepareResumeText(resume.extracted_text ?? "");

    const { data: validation } = await validateResume(text);
    const verdict = verdictFrom(validation);
    if (!verdict.ok) {
      // Not a usable résumé: discard it so the candidate can upload another.
      await deleteResume(userId, id);
      claimed = false;
      const message = verdict.reason
        ? `${MESSAGES[verdict.code]} ${verdict.reason}`
        : MESSAGES[verdict.code];
      return apiError(422, verdict.code, message);
    }

    const { profile, model } = await analyzeResume(text);
    if (skillCount(profile) === 0 && profile.projects.length === 0) {
      await deleteResume(userId, id);
      claimed = false;
      return apiError(422, "insufficient_information", MESSAGES.insufficient_information);
    }

    const analysis = buildAnalysisRecord(validation, profile, model);
    await markAnalyzed(userId, id, analysis);
    claimed = false;
    // The new résumé replaces any earlier one.
    await deleteOtherResumes(userId, id).catch((error) =>
      console.error("[resumes] cleanup of previous résumés failed", error),
    );

    return json({ resumeId: id, analysis });
  } catch (error) {
    if (claimed) await markFailed(userId, id).catch(() => {});

    if (error instanceof AiError) {
      console.error("[resumes] AI analysis failed", error.code, error.message, error.cause);
      if (error.code === "not_configured") {
        return apiError(503, "ai_not_configured", MESSAGES.ai_not_configured);
      }
      return apiError(502, "ai_unavailable", MESSAGES.ai_unavailable, true);
    }
    console.error("[resumes] analysis failed", error);
    return apiError(500, "server_error", MESSAGES.server_error, true);
  }
}
