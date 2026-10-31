import { z } from "zod";
import {
  TIER_CONFIG,
  type CodeLanguage,
  type Difficulty,
  type PracticalType,
  type Tier,
  type WrittenType,
} from "@/lib/assessment/config";

// ---------------------------------------------------------------------------
// Model output schemas. Sent to the model as strict JSON Schema, so no
// transforms or length constraints here; validate.ts enforces the rest.
// ---------------------------------------------------------------------------

const modelTestCase = z.object({
  name: z.string(),
  /** JSON array of arguments, e.g. "[[1,2,3], 2]". */
  argsJson: z.string(),
  /** JSON of the expected return value. Use "null" when expectThrows is true. */
  expectedJson: z.string(),
  expectThrows: z.boolean(),
  /** Hidden tests are never shown to the candidate. */
  hidden: z.boolean(),
});

const rubricSchema = z.object({
  modelAnswer: z.string(),
  keyPoints: z.array(z.string()),
  criteria: z.array(
    z.object({ name: z.string(), description: z.string(), points: z.number().int() }),
  ),
  redFlags: z.array(z.string()),
});

export type Rubric = z.infer<typeof rubricSchema>;

const common = {
  title: z.string(),
  statement: z.string(),
  resumeEvidence: z.array(z.string()),
  skillsTested: z.array(z.string()),
  timeMinutes: z.number().int(),
};

function asTuple<T extends string>(values: readonly T[]) {
  return values as unknown as [T, ...T[]];
}

/**
 * Tier-specific schema: the allowed written/practical types (and practical
 * languages) are baked in, so the decoder can't emit anything else.
 * `languages` empty means the tier's practical slots come from templates and
 * the model writes only the written questions.
 */
export function tierOutputSchema(tier: Tier, languages: readonly CodeLanguage[]) {
  const config = TIER_CONFIG[tier];
  const writtenTypes = Object.keys(config.written) as WrittenType[];

  const written = z.object({
    kind: z.literal("written"),
    type: z.enum(asTuple(writtenTypes)),
    ...common,
    rubric: rubricSchema,
  });

  if (languages.length === 0) {
    return z.object({ questions: z.array(written) });
  }

  const practical = z.object({
    kind: z.literal("practical"),
    type: z.enum(asTuple(config.practicalTypes)),
    ...common,
    language: z.enum(asTuple(languages)),
    entryFunction: z.string(),
    starterCode: z.string(),
    referenceCode: z.string(),
    tests: z.array(modelTestCase),
    gradingNotes: z.string(),
  });

  return z.object({ questions: z.array(z.discriminatedUnion("kind", [practical, written])) });
}

export type ModelQuestion = z.infer<ReturnType<typeof tierOutputSchema>>["questions"][number];
export type ModelPracticalQuestion = Extract<ModelQuestion, { kind: "practical" }>;
export type ModelWrittenQuestion = Extract<ModelQuestion, { kind: "written" }>;

// ---------------------------------------------------------------------------
// Validated, normalised questions ready to persist.
// ---------------------------------------------------------------------------

export type TestCase = {
  name: string;
  args: unknown[];
  expected: unknown;
  expectThrows: boolean;
  hidden: boolean;
};

export type ValidationReport =
  | {
      method: "sandbox";
      runtime: "quickjs-wasm";
      reference: { passed: number; total: number };
      starter: { passed: number; total: number };
      /** Malformed tests, or tests the reference disagreed with, that were removed. */
      droppedTests: number;
      validatedAt: string;
    }
  | { method: "template"; templateId: string; prevalidated: true; validatedAt: string };

type BaseQuestion = {
  tier: Tier;
  difficulty: Difficulty;
  title: string;
  statement: string;
  resumeEvidence: string[];
  skillsTested: string[];
  timeMinutes: number;
};

export type PracticalQuestion = BaseQuestion & {
  kind: "practical";
  type: PracticalType;
  language: CodeLanguage;
  entryFunction: string;
  starterCode: string;
  referenceCode: string;
  tests: TestCase[];
  gradingNotes: string;
  source: "ai" | "template";
  validation: ValidationReport;
};

export type WrittenQuestion = BaseQuestion & {
  kind: "written";
  type: WrittenType;
  rubric: Rubric;
};

export type GeneratedQuestion = PracticalQuestion | WrittenQuestion;
