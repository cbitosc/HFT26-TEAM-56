import { describe, expect, it, vi } from "vitest";
import type { TestCase } from "@/lib/assessment/schemas";
import { generateHint } from "@/lib/assistant/assistant";
import { GUARDRAIL_REFUSAL, checkAssistantReply, type GuardrailContext } from "@/lib/assistant/guardrails";
import { buildAssistantMessages, type AssistantInput } from "@/lib/assistant/prompt";

const reference = `function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}`;

const tests: TestCase[] = [
  { name: "basic", args: [[[1, 3], [2, 6]]], expected: [[1, 6]], expectThrows: false, hidden: false },
  { name: "touching edges", args: [[[1, 4], [4, 5], [10, 12]]], expected: [[1, 5], [10, 12]], expectThrows: false, hidden: true },
];

const guard: GuardrailContext = {
  kind: "practical",
  entryPoint: "mergeIntervals",
  referenceCode: [reference],
  modelAnswer: null,
  tests,
  publicText: ["Merge overlapping intervals.", "function mergeIntervals(intervals) {\n  throw new Error('Not implemented');\n}"],
};

const input: AssistantInput = {
  question: {
    kind: "practical",
    type: "coding",
    title: "Merge booking intervals",
    statement: "Merge overlapping intervals.",
    skillsTested: ["JavaScript"],
    language: "javascript",
    entryPoint: "mergeIntervals",
    exampleTests: tests.filter((t) => !t.hidden).map(({ name, args, expected, expectThrows }) => ({ name, args, expected, expectThrows })),
  },
  work: "function mergeIntervals(intervals) { return intervals; }",
  lastRun: { outcome: "failed", passed: 0, total: 1, error: null, tests: [{ name: "basic", passed: false, actual: "[[1,3],[2,6]]" }] },
  history: [{ prompt: "What does overlapping mean?", response: "Two intervals share at least one point." }],
  prompt: "Why does my code fail?",
};

describe("assistant context", () => {
  it("contains the public question, the candidate's work and history, but never secrets", () => {
    const messages = buildAssistantMessages(input);
    const all = messages.map((m) => m.content).join("\n");
    expect(all).toContain("Merge booking intervals");
    expect(all).toContain("mergeIntervals([[1,3],[2,6]])");
    expect(all).toContain("return intervals;");
    expect(all).toContain("What does overlapping mean?");
    expect(all).not.toContain("touching edges");
    expect(all).not.toContain("[[1,4],[4,5],[10,12]]");
    expect(all).not.toContain("Math.max(last[1], end)");
    expect(messages.at(-1)).toEqual({ role: "user", content: "Why does my code fail?" });
  });
});

describe("guardrails", () => {
  it("allows short conceptual hints and small syntax snippets", () => {
    expect(checkAssistantReply("Have you sorted the intervals by start first? Think about what happens when one ends exactly where the next begins.", guard)).toEqual({ ok: true });
    expect(checkAssistantReply("You can sort numerically like this:\n```js\narr.sort((a, b) => a - b);\n```", guard)).toEqual({ ok: true });
  });

  it("blocks complete solutions, the reference implementation and hidden tests", () => {
    expect(checkAssistantReply(`Here you go:\n\`\`\`js\n${reference}\n\`\`\``, guard)).toMatchObject({ ok: false });
    expect(
      checkAssistantReply("Use `const sorted = [...intervals].sort((a, b) => a[0] - b[0]);` then compare `if (last && start <= last[1]) last[1] = Math.max(last[1], end);`", guard),
    ).toEqual({ ok: false, reason: "reference_overlap" });
    expect(checkAssistantReply("Try the input [[1,4],[4,5],[10,12]] yourself.", guard)).toEqual({ ok: false, reason: "hidden_test" });
    expect(checkAssistantReply("function mergeIntervals(x) {\n  const a = 1;\n  return x;\n}", guard)).toMatchObject({ ok: false });
  });

  it("blocks written-answer leakage of the model answer", () => {
    const modelAnswer =
      "Idempotency keys let the server recognise a retried request and return the original response instead of charging the card twice, which requires storing the key with the result atomically.";
    const written: GuardrailContext = { ...guard, kind: "written", entryPoint: null, referenceCode: [], tests: [], modelAnswer, publicText: ["How would you prevent double charges?"] };
    expect(checkAssistantReply("Think about what the server could remember between two identical requests.", written)).toEqual({ ok: true });
    expect(checkAssistantReply(`The answer: ${modelAnswer}`, written)).toEqual({ ok: false, reason: "model_answer_overlap" });
  });

  it("retries once with a correction, then refuses", async () => {
    const leaky = { content: `\`\`\`js\n${reference}\n\`\`\``, model: "m" };
    const safe = { content: "Sort first, then compare each interval with the last merged one.", model: "m" };

    const rewritten = vi.fn().mockResolvedValueOnce(leaky).mockResolvedValueOnce(safe);
    expect(await generateHint(input, guard, rewritten)).toMatchObject({ guardrail: "rewritten", reply: safe.content });
    expect(rewritten.mock.calls[1][0].at(-1).content).toMatch(/revealed too much/);

    const stubborn = vi.fn().mockResolvedValue(leaky);
    expect(await generateHint(input, guard, stubborn)).toMatchObject({ guardrail: "blocked", reply: GUARDRAIL_REFUSAL });

    const fine = vi.fn().mockResolvedValue({ content: "<think>internal</think>Check your comparison operator.", model: "m" });
    expect(await generateHint(input, guard, fine)).toMatchObject({ guardrail: "passed", reply: "Check your comparison operator." });
  });
});
