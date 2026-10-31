import type { NextRequest } from "next/server";
import { apiError, isUuid, json, parseBody, requireUser } from "@/lib/api/http";
import { sessionErrorResponse } from "@/lib/api/session";
import { AiError } from "@/lib/ai/client";
import { TIER_CONFIG } from "@/lib/assessment/config";
import { assistantBody } from "@/lib/assessment/requests";
import {
  countRecent,
  latestRun,
  loadChat,
  loadQuestionSecrets,
  recordAiInteraction,
  requireActiveQuestion,
} from "@/lib/assessment/session";
import { generateHint } from "@/lib/assistant/assistant";

export const maxDuration = 60;

const HINTS_PER_MINUTE = 6;
const HINTS_PER_QUESTION = 20;

/**
 * POST /api/assessments/:id/questions/:questionId/assistant   body: { message, work? }
 * A guarded hint for a question in the open stage. Disabled for Novice.
 * The model gets the question's public fields, the candidate's work and the
 * conversation; hidden tests and reference solutions stay on the server and
 * are only used to check the reply. Every exchange is logged.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/assessments/[id]/questions/[questionId]/assistant">,
) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;
  const { id, questionId } = await params;
  if (!isUuid(id) || !isUuid(questionId)) return apiError(404, "not_found", "Question not found.");

  const body = await parseBody(request, assistantBody);
  if (body.response) return body.response;

  try {
    const { question, stage, answer } = await requireActiveQuestion(userId, id, questionId);
    if (!TIER_CONFIG[stage.tier].aiAssistance || !question.aiAssistance) {
      return apiError(403, "ai_disabled", `AI assistance isn't available in the ${TIER_CONFIG[stage.tier].label} stage.`);
    }
    const [recent, onQuestion] = await Promise.all([
      countRecent("ai_interactions", userId, 60),
      countRecent("ai_interactions", userId, 24 * 60 * 60, questionId),
    ]);
    if (recent >= HINTS_PER_MINUTE) return apiError(429, "rate_limited", "Give the last hint a try first, then ask again in a moment.");
    if (onQuestion >= HINTS_PER_QUESTION) return apiError(429, "hint_limit", "You've used all the hints for this question.");

    const [secrets, run, history] = await Promise.all([
      loadQuestionSecrets(questionId),
      question.kind === "practical" ? latestRun(questionId) : Promise.resolve(null),
      loadChat(questionId),
    ]);
    const saved = (question.kind === "practical" ? answer?.code : answer?.answerText) ?? "";
    const work = body.data.work ?? saved;

    const hint = await generateHint(
      {
        question,
        work,
        lastRun: run,
        history,
        prompt: body.data.message,
      },
      {
        kind: question.kind,
        entryPoint: question.entryPoint,
        referenceCode: secrets.referenceCode,
        modelAnswer: secrets.modelAnswer,
        tests: secrets.tests,
        publicText: [question.statement, ...question.starterFiles.map((file) => file.content), work, body.data.message],
      },
    );
    if (hint.guardrail !== "passed") {
      console.info(`[assistant] ${id}/${questionId} reply ${hint.guardrail} (${hint.reason})`);
    }

    const logged = await recordAiInteraction(userId, id, questionId, {
      prompt: body.data.message,
      response: hint.reply,
      guardrail: hint.guardrail,
      model: hint.model,
    });
    if (logged.result === "ai_disabled") return apiError(403, "ai_disabled", "AI assistance isn't available for this question.");

    return json({
      turn: { id: crypto.randomUUID(), prompt: body.data.message, response: hint.reply, createdAt: new Date().toISOString() },
      hintNumber: logged.hintNumber ?? null,
    });
  } catch (error) {
    if (error instanceof AiError) {
      console.error("[assistant] unavailable", error);
      return apiError(503, "ai_unavailable", "The assistant is unavailable right now. Your work is saved; try again in a moment.", true);
    }
    return sessionErrorResponse(error, "assistant");
  }
}
