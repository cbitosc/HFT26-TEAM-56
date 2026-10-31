import "server-only";
import { AiError, getAiClient } from "@/lib/ai/client";
import {
  GUARDRAIL_REFUSAL,
  checkAssistantReply,
  type GuardrailContext,
  type GuardrailReason,
} from "@/lib/assistant/guardrails";
import { buildAssistantMessages, type AssistantInput, type ChatMessage } from "@/lib/assistant/prompt";

export type HintResult = {
  reply: string;
  guardrail: "passed" | "rewritten" | "blocked";
  reason: GuardrailReason | null;
  model: string | null;
};

type Complete = (messages: ChatMessage[]) => Promise<{ content: string; model: string }>;

/** Reasoning models may prepend their thinking; only the answer is shown. */
function cleanReply(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim().slice(0, 6_000);
}

async function completeWithProvider(messages: ChatMessage[]) {
  const { client, model, provider } = getAiClient();
  try {
    const completion = await client.chat.completions.create(
      { model, messages, temperature: 0.3, max_tokens: 500 },
      { timeout: 30_000, maxRetries: 1 },
    );
    return { content: completion.choices[0]?.message?.content ?? "", model: completion.model || model };
  } catch (error) {
    throw new AiError("request_failed", `${provider} request failed`, { cause: error });
  }
}

/**
 * Asks the model for a hint and checks the reply against the question's
 * secrets. A reply that gives too much away is regenerated once with a
 * correction; if it still does, a fixed refusal is returned instead.
 */
export async function generateHint(
  input: AssistantInput,
  guard: GuardrailContext,
  complete: Complete = completeWithProvider,
): Promise<HintResult> {
  const messages = buildAssistantMessages(input);
  const first = await complete(messages);
  const reply = cleanReply(first.content);
  if (!reply) throw new AiError("invalid_response", "Empty assistant reply");

  const verdict = checkAssistantReply(reply, guard);
  if (verdict.ok) return { reply, guardrail: "passed", reason: null, model: first.model };

  const retry = await complete([
    ...messages,
    { role: "assistant", content: reply },
    {
      role: "user",
      content:
        "That reply revealed too much of the answer. Reply again with only a short conceptual hint or a guiding question, at most 3 lines of code, and no part of the solution.",
    },
  ]).catch(() => null);
  const second = retry ? cleanReply(retry.content) : "";
  if (second && checkAssistantReply(second, guard).ok) {
    return { reply: second, guardrail: "rewritten", reason: verdict.reason, model: retry?.model ?? first.model };
  }
  return { reply: GUARDRAIL_REFUSAL, guardrail: "blocked", reason: verdict.reason, model: first.model };
}
