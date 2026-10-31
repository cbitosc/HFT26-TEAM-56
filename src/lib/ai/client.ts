import "server-only";
import OpenAI from "openai";
import { z } from "zod";

export type AiErrorCode = "not_configured" | "request_failed" | "invalid_response";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiError";
  }
}

type Provider = {
  name: "featherless" | "openrouter";
  apiKey: string;
  model: string;
  baseURL: string;
  headers?: Record<string, string>;
};

/**
 * Both providers speak the OpenAI Chat Completions API and enforce
 * `response_format: json_schema`. Featherless is used when its key is set;
 * OpenRouter is the fallback. `*_BASE_URL` overrides are for proxies or a
 * local mock in tests.
 */
function resolveProvider(): Provider {
  const env = process.env;

  if (env.FEATHERLESS_API_KEY) {
    if (!env.FEATHERLESS_MODEL) {
      throw new AiError("not_configured", "Set FEATHERLESS_MODEL in .env.local.");
    }
    return {
      name: "featherless",
      apiKey: env.FEATHERLESS_API_KEY,
      model: env.FEATHERLESS_MODEL,
      baseURL: env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1",
    };
  }

  if (env.OPENROUTER_API_KEY) {
    if (!env.OPENROUTER_MODEL) {
      throw new AiError("not_configured", "Set OPENROUTER_MODEL in .env.local.");
    }
    return {
      name: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL,
      baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      // Optional attribution headers recognised by OpenRouter.
      headers: {
        ...(env.NEXT_PUBLIC_SITE_URL ? { "HTTP-Referer": env.NEXT_PUBLIC_SITE_URL } : {}),
        "X-Title": "Vetted",
      },
    };
  }

  throw new AiError(
    "not_configured",
    "Set FEATHERLESS_API_KEY and FEATHERLESS_MODEL (or the OPENROUTER_ equivalents) in .env.local.",
  );
}

let cached: { client: OpenAI; model: string; provider: Provider["name"] } | null = null;

/** OpenAI-compatible client for the configured provider. Server only. */
export function getAiClient() {
  if (cached) return cached;

  const provider = resolveProvider();
  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    timeout: 90_000,
    // The SDK retries connection errors, 408, 409, 429 (e.g. Featherless
    // concurrency limits) and 5xx with backoff.
    maxRetries: 3,
    defaultHeaders: provider.headers,
  });

  cached = { client, model: provider.model, provider: provider.name };
  return cached;
}

/** Pulls a JSON value out of a reply that may be fenced or wrapped in prose. */
function parseJsonReply(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON object in reply");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

type StructuredRequest<T extends z.ZodType> = {
  /** Schema name sent to the provider, e.g. "resume_validation". */
  name: string;
  schema: T;
  system: string;
  user: string;
  maxTokens?: number;
  /** Per-request timeout, for long generations. */
  timeoutMs?: number;
  /** Sampling temperature; 0 for extraction, a little higher for creative work. */
  temperature?: number;
};

/** OpenAI-style strict mode accepts anyOf but not oneOf. */
function toStrictCompatible(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictCompatible);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key === "oneOf" ? "anyOf" : key, toStrictCompatible(value)]),
    );
  }
  return node;
}

/**
 * Requests strict JSON matching `schema` and validates the reply with Zod.
 * Retries once with the validation error when the model returns malformed
 * or off-schema JSON. Returns the parsed value and the model that answered.
 */
export async function generateStructured<T extends z.ZodType>({
  name,
  schema,
  system,
  user,
  maxTokens = 4096,
  timeoutMs,
  temperature = 0,
}: StructuredRequest<T>): Promise<{ data: z.infer<T>; model: string }> {
  const { client, model, provider } = getAiClient();
  const jsonSchema = toStrictCompatible(
    z.toJSONSchema(schema, { target: "draft-7" }),
  ) as Record<string, unknown>;
  delete jsonSchema.$schema;

  // Repeat the schema in the prompt for providers that ignore response_format.
  const systemPrompt = `${system}\n\nRespond with a single JSON object that matches this JSON Schema exactly, with no other text:\n${JSON.stringify(jsonSchema)}`;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: user },
  ];

  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await client.chat.completions.create(
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: {
            type: "json_schema",
            json_schema: { name, strict: true, schema: jsonSchema },
          },
        },
        // Callers that set a timeout run their own retry loop, so don't double the wait.
        timeoutMs ? { timeout: timeoutMs, maxRetries: 0 } : undefined,
      );
    } catch (error) {
      throw new AiError("request_failed", `${provider} request failed`, {
        cause: error,
      });
    }

    const content = completion.choices[0]?.message?.content ?? "";
    try {
      const result = schema.safeParse(parseJsonReply(content));
      if (result.success) {
        return { data: result.data, model: completion.model || model };
      }
      lastProblem = z.prettifyError(result.error);
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : "Invalid JSON";
    }

    messages.push(
      { role: "assistant", content },
      {
        role: "user",
        content: `That reply was not valid for the schema (${lastProblem.slice(0, 500)}). Reply again with only the corrected JSON object.`,
      },
    );
  }

  throw new AiError("invalid_response", `Model returned invalid JSON: ${lastProblem}`);
}
