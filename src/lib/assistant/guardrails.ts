import type { TestCase } from "@/lib/assessment/schemas";

// Output guardrails for the hint assistant. The model is instructed not to
// give answers away; these checks catch replies that do anyway. They run on
// the server with the question's secrets, which are never sent to the model:
// the reference solution and model answer are only compared against.

export type GuardrailReason =
  | "too_long"
  | "long_code"
  | "entry_definition"
  | "reference_overlap"
  | "model_answer_overlap"
  | "hidden_test";

export type GuardrailVerdict = { ok: true } | { ok: false; reason: GuardrailReason };

export type GuardrailContext = {
  kind: "practical" | "written";
  entryPoint: string | null;
  /** Server-side only: reference solution files. */
  referenceCode: string[];
  /** Server-side only: the rubric's model answer for written questions. */
  modelAnswer: string | null;
  /** Server-side only: every test, hidden ones included. */
  tests: TestCase[];
  /** Text the candidate can already see (statement, starter code, their own work); overlap with it is fine. */
  publicText: string[];
};

export const MAX_REPLY_WORDS = 220;
/** Code lines a hint may contain, to illustrate syntax or a concept. */
export const MAX_CODE_LINES = 6;
// Long enough that common idioms (a numeric sort, a loop header) aren't flagged.
const CODE_SHINGLE = 12;
const WORD_SHINGLE = 8;

const FENCE = /```[^\n]*\n([\s\S]*?)```/g;

function fencedCode(reply: string) {
  return [...reply.matchAll(FENCE)].map((match) => match[1]);
}

const CODE_LIKE = /(^\s*(def |class |return\b|const |let |var |function\b|if\s*\(|for\s*\(|while\s*\(|import |from \S+ import))|([;{}]\s*$)|(=>)/;

/** Lines that look like code: inside fences, or unfenced lines with code syntax. */
export function codeLineCount(reply: string) {
  const fenced = fencedCode(reply).flatMap((block) => block.split("\n")).filter((line) => line.trim()).length;
  const outside = reply.replace(FENCE, "").split("\n").filter((line) => CODE_LIKE.test(line)).length;
  return fenced + outside;
}

function codeTokens(code: string) {
  return code.match(/[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|===|!==|==|!=|<=|>=|=>|&&|\|\||[-+*/%<>=!?:.,;(){}[\]]/g) ?? [];
}

function wordTokens(text: string) {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function shingles(tokens: string[], size: number) {
  const set = new Set<string>();
  for (let i = 0; i + size <= tokens.length; i++) set.add(tokens.slice(i, i + size).join(" "));
  return set;
}

/** Shingles shared by `reply` and `secret` that don't also appear in public text. */
function sharedShingles(reply: string[], secret: string[], publicTokens: string[][], size: number) {
  const secretSet = shingles(secret, size);
  const publicSet = new Set(publicTokens.flatMap((tokens) => [...shingles(tokens, size)]));
  let shared = 0;
  for (const shingle of shingles(reply, size)) {
    if (secretSet.has(shingle) && !publicSet.has(shingle)) shared++;
  }
  return shared;
}

const compact = (value: string) => value.replace(/\s+/g, "");

export function checkAssistantReply(reply: string, context: GuardrailContext): GuardrailVerdict {
  if (wordTokens(reply).length > MAX_REPLY_WORDS) return { ok: false, reason: "too_long" };

  const codeLines = codeLineCount(reply);
  if (codeLines > MAX_CODE_LINES) return { ok: false, reason: "long_code" };

  if (context.entryPoint) {
    const name = context.entryPoint.replace(/[$]/g, "\\$");
    const definition = new RegExp(`(function\\s+${name}\\s*\\(|def\\s+${name}\\s*\\(|\\b${name}\\s*=\\s*(async\\s*)?(function|\\())`);
    if (definition.test(reply) && codeLines > 2) return { ok: false, reason: "entry_definition" };
  }

  const replyCode = codeTokens(reply);
  const publicCode = context.publicText.map(codeTokens);
  for (const reference of context.referenceCode) {
    if (sharedShingles(replyCode, codeTokens(reference), publicCode, CODE_SHINGLE) >= 2) {
      return { ok: false, reason: "reference_overlap" };
    }
  }

  if (context.modelAnswer) {
    const publicWords = context.publicText.map(wordTokens);
    if (sharedShingles(wordTokens(reply), wordTokens(context.modelAnswer), publicWords, WORD_SHINGLE) >= 2) {
      return { ok: false, reason: "model_answer_overlap" };
    }
  }

  const replyCompact = compact(reply);
  const publicCompact = context.publicText.map(compact).join("\n");
  for (const test of context.tests) {
    if (!test.hidden) continue;
    for (const value of [JSON.stringify(test.args.length === 1 ? test.args[0] : test.args), JSON.stringify(test.expected)]) {
      if (value && value.length >= 8 && replyCompact.includes(compact(value)) && !publicCompact.includes(compact(value))) {
        return { ok: false, reason: "hidden_test" };
      }
    }
  }

  return { ok: true };
}

export const GUARDRAIL_REFUSAL =
  "I can't give that away directly, since it would answer the question for you. Try telling me what you've tried so far or which part is unclear, and I'll point you in the right direction.";
