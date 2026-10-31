import "server-only";
import { GenerationError, generateAssessment } from "@/lib/assessment/generate";
import type { GenerationStage } from "@/lib/assessment/config";
import { markGenerationFailed, saveGeneratedQuestions, setGenerationStage } from "@/lib/assessment/store";
import type { ResumeProfile } from "@/lib/resumes/schemas";

const FAILURE_REASONS: Record<GenerationError["code"] | "unknown", string> = {
  unsupported_languages:
    "Practical questions need JavaScript, TypeScript or Python on your résumé, and none of these were found.",
  ai_unavailable: "The question generator is unavailable right now. Please try again in a few minutes.",
  generation_failed: "We couldn't produce a fully validated assessment this time. Please try again.",
  unknown: "Something went wrong while generating your assessment. Please try again.",
};

/**
 * Background job: generate, validate and persist. Never throws; on failure
 * the assessment is marked `failed` with a candidate-facing reason.
 */
export async function runAssessmentGeneration(userId: string, assessmentId: string, profile: ResumeProfile) {
  const started = Date.now();
  // Stage updates are written in order and never block or fail generation.
  let stageWrites = Promise.resolve();
  const reportStage = (stage: GenerationStage) => {
    stageWrites = stageWrites
      .then(() => setGenerationStage(userId, assessmentId, stage))
      .catch((error) => console.error("[assessments] could not record stage", stage, error));
  };
  try {
    const result = await generateAssessment(profile, {}, { onStage: reportStage });
    reportStage("preparing");
    await stageWrites;
    await saveGeneratedQuestions(userId, assessmentId, result.questions);
    console.info(
      `[assessments] ${assessmentId} ready in ${Math.round((Date.now() - started) / 1000)}s (${result.model}): ${result.log.join("; ")}`,
    );
  } catch (error) {
    await stageWrites;
    const code = error instanceof GenerationError ? error.code : "unknown";
    console.error(`[assessments] ${assessmentId} failed (${code})`, error);
    await markGenerationFailed(userId, assessmentId, FAILURE_REASONS[code]).catch((markError) =>
      console.error("[assessments] could not mark failed", markError),
    );
  }
}
