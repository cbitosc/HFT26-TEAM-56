import type { generateStructured } from "@/lib/ai/client";
import { CHALLENGE_TEMPLATES } from "@/lib/assessment/templates";
import type { TestCase } from "@/lib/assessment/schemas";
import type { Tier } from "@/lib/assessment/config";

// Builds model-shaped questions and a scripted stand-in for the AI client.
// Practical questions reuse the prevalidated template code, so they really
// run in the sandbox during tests.

type Json = Record<string, unknown>;

export function written(type: string, title: string, overrides: Json = {}): Json {
  return {
    kind: "written",
    type,
    title,
    statement:
      "In the Orders API project you built paginated REST endpoints on PostgreSQL with TypeScript and Express. Explain your approach in detail, including trade-offs.",
    resumeEvidence: ["Project Orders API: REST API for orders with pagination, built with TypeScript, Express and PostgreSQL"],
    skillsTested: ["TypeScript", "PostgreSQL"],
    timeMinutes: 4,
    rubric: {
      modelAnswer:
        "A strong answer explains keyset versus offset pagination, index usage in PostgreSQL, consistent ordering, and how the API validates page parameters before querying.",
      keyPoints: ["Offset vs keyset pagination", "Stable ordering with an index", "Input validation"],
      criteria: [
        { name: "Correctness", description: "Accurate technical explanation", points: 5 },
        { name: "Trade-offs", description: "Discusses alternatives", points: 5 },
      ],
      redFlags: ["Loads every row into memory"],
    },
    ...overrides,
  };
}

function modelTests(tests: TestCase[]) {
  return tests.map((test) => ({
    name: test.name,
    argsJson: JSON.stringify(test.args),
    expectedJson: JSON.stringify(test.expected),
    expectThrows: test.expectThrows,
    hidden: test.hidden,
  }));
}

export function practical(templateId: string, overrides: Json = {}): Json {
  const template = CHALLENGE_TEMPLATES.find((candidate) => candidate.id === templateId)!;
  return {
    kind: "practical",
    type: template.type,
    title: `${template.title} for Orders API`,
    statement: template.statement("This mirrors logic from your Orders API and RateKeeper projects in TypeScript.", "typescript"),
    resumeEvidence: ["Project Orders API: REST API for orders built with TypeScript and Express"],
    skillsTested: ["TypeScript"],
    timeMinutes: 5,
    language: "typescript",
    entryFunction: template.entry.typescript,
    starterCode: template.starter.typescript,
    referenceCode: template.reference.typescript,
    tests: modelTests(template.tests),
    gradingNotes: "Handles every rule in the statement.",
    ...overrides,
  };
}

export const VALID_TIERS: Record<Tier, () => Json[]> = {
  novice: () => [
    written("theory", "TypeScript structural typing"),
    written("theory", "Express middleware order"),
    written("theory", "PostgreSQL index basics"),
    practical("summarize-totals"),
  ],
  adept: () => [
    written("theory", "Redis expiry semantics"),
    written("situational", "Slow paginated endpoint in Orders API"),
    practical("paginate"),
    practical("parse-query"),
  ],
  master: () => [
    written("architecture", "Scaling RateKeeper across regions"),
    written("problem_solving", "Reconciling Orders API ledger drift"),
    practical("token-bucket"),
    practical("replay-ledger"),
  ],
};

export type ModelCall = { tier: Tier; user: string; attempt: number };

/**
 * Fake `generateStructured`. `script(tier, attempt)` returns the questions for
 * that call. Output is validated against the request's own schema, exactly
 * as the real client does.
 */
export function fakeModel(script: (tier: Tier, attempt: number) => Json[]) {
  const calls: ModelCall[] = [];
  const counts = new Map<Tier, number>();
  const ai = (async (request: Parameters<typeof generateStructured>[0]) => {
    const tier = request.name.replace("_questions", "") as Tier;
    const attempt = (counts.get(tier) ?? 0) + 1;
    counts.set(tier, attempt);
    calls.push({ tier, user: request.user, attempt });
    // Retries may only accept the missing slots; when practical questions
    // aren't allowed any more, drop them like a schema-constrained decoder would.
    const questions = script(tier, attempt);
    const parsed = request.schema.safeParse({ questions });
    const data = parsed.success
      ? parsed.data
      : request.schema.parse({ questions: questions.filter((question) => question.kind === "written") });
    return { data, model: "fake/model" };
  }) as typeof generateStructured;
  return { ai, calls };
}
