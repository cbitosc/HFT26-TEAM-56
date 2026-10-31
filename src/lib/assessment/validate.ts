import {
  totalNeeded,
  type CodeLanguage,
  type SlotNeed,
  type WrittenType,
} from "@/lib/assessment/config";
import {
  isGroundedEvidence,
  isSupportedSkill,
  unsupportedDsaTopics,
  unsupportedTechnologies,
  type Claims,
} from "@/lib/assessment/grounding";
import { IDENTIFIER, buildJsHarness } from "@/lib/assessment/harness";
import type {
  ModelPracticalQuestion,
  ModelQuestion,
  ModelWrittenQuestion,
  TestCase,
} from "@/lib/assessment/schemas";
import type { SandboxJob, SandboxJobResult, SandboxLanguage, TestRun } from "@/lib/sandbox/quickjs";
import { toTestRun } from "@/lib/sandbox/quickjs";

// Deterministic checks on model output. Each returns human-readable issues;
// an empty list means the question passed. Issues are fed back to the model
// on retry, so they say exactly what to change.

const MIN_TESTS = 5;
const MAX_TESTS = 12;
const MIN_VISIBLE_TESTS = 2;
const MIN_HIDDEN_TESTS = 3;
const MAX_CODE_CHARS = 12_000;
const MAX_TEST_JSON_CHARS = 20_000;
const SANDBOX_TIMEOUT_MS = 3_000;

function textOf(question: ModelQuestion) {
  return [question.title, question.statement, ...question.skillsTested, ...question.resumeEvidence].join("\n");
}

/** Checks shared by written and practical questions. */
function checkCommon(question: ModelQuestion, claims: Claims) {
  const issues: string[] = [];
  const title = question.title.trim();
  if (title.length < 5 || title.length > 120) issues.push("Title must be 5-120 characters.");
  if (question.statement.trim().length < 60) issues.push("Problem statement is too short; give full context and requirements.");
  if (question.statement.length > 4000) issues.push("Problem statement is too long (max 4000 characters).");

  if (question.resumeEvidence.length === 0 || question.resumeEvidence.length > 5) {
    issues.push("Provide 1-5 resumeEvidence entries.");
  }
  for (const evidence of question.resumeEvidence) {
    if (!isGroundedEvidence(evidence, claims)) {
      issues.push(`resumeEvidence "${evidence.slice(0, 80)}" doesn't cite a specific project, role or technology from the profile.`);
    }
  }

  // At least one skill must be a claim from the profile; the rest may name
  // concepts within those claimed areas. Unclaimed technologies and DSA
  // topics are rejected below wherever they appear.
  if (question.skillsTested.length === 0 || question.skillsTested.length > 6) {
    issues.push("Provide 1-6 skillsTested entries.");
  } else if (!question.skillsTested.some((skill) => isSupportedSkill(skill, claims))) {
    issues.push(
      `None of skillsTested (${question.skillsTested.join(", ")}) is claimed in the profile. Include at least one technology or competency exactly as the profile spells it.`,
    );
  }

  const text = textOf(question);
  for (const name of unsupportedTechnologies(text, claims)) {
    issues.push(`Mentions ${name}, which the candidate doesn't claim. Don't introduce unrelated technologies.`);
  }
  for (const topic of unsupportedDsaTopics(text, claims)) {
    issues.push(`Relies on ${topic}, a DSA topic the résumé doesn't mention. Don't assume DSA knowledge.`);
  }
  return issues;
}

export function checkWrittenQuestion(question: ModelWrittenQuestion, claims: Claims) {
  const issues = checkCommon(question, claims);
  const { rubric } = question;
  if (rubric.modelAnswer.trim().length < 80) issues.push("rubric.modelAnswer must be a complete reference answer.");
  if (rubric.keyPoints.length < 3) issues.push("rubric.keyPoints needs at least 3 points a strong answer covers.");
  if (rubric.criteria.length < 2) issues.push("rubric.criteria needs at least 2 scoring criteria.");
  if (rubric.criteria.some((criterion) => criterion.points < 1 || criterion.points > 10)) {
    issues.push("Each rubric criterion must be worth 1-10 points.");
  }
  return issues;
}

/** Minimum suite shape; returns issues when the tests fall short. */
export function checkTestMinimums(tests: TestCase[], context = "") {
  const issues: string[] = [];
  if (tests.length < MIN_TESTS || tests.length > MAX_TESTS) {
    issues.push(`Provide ${MIN_TESTS}-${MAX_TESTS} valid test cases (got ${tests.length}${context}).`);
  }
  if (tests.filter((test) => !test.hidden).length < MIN_VISIBLE_TESTS) {
    issues.push(`Keep at least ${MIN_VISIBLE_TESTS} valid visible examples (hidden: false)${context}.`);
  }
  if (tests.filter((test) => test.hidden).length < MIN_HIDDEN_TESTS) {
    issues.push(`Keep at least ${MIN_HIDDEN_TESTS} valid hidden tests${context}.`);
  }
  return issues;
}

/**
 * Parses the model's JSON-string test cases. A malformed case is dropped
 * rather than sinking the whole question; the suite only fails if too few
 * valid cases remain.
 */
export function parseTestCases(question: ModelPracticalQuestion): {
  tests: TestCase[];
  issues: string[];
  dropped: string[];
} {
  const dropped: string[] = [];
  const tests: TestCase[] = [];
  const names = new Set<string>();

  for (const raw of question.tests) {
    let name = raw.name.trim() || `test ${tests.length + 1}`;
    while (names.has(name)) name = `${name} (2)`;
    names.add(name);
    if (raw.argsJson.length + raw.expectedJson.length > MAX_TEST_JSON_CHARS) {
      dropped.push(`Test "${name}" is too large; keep test data small.`);
      continue;
    }
    let args: unknown;
    try {
      args = JSON.parse(raw.argsJson);
    } catch {
      dropped.push(`Test "${name}": argsJson is not valid JSON.`);
      continue;
    }
    if (!Array.isArray(args)) {
      dropped.push(`Test "${name}": argsJson must be a JSON array of arguments.`);
      continue;
    }
    let expected: unknown = null;
    if (!raw.expectThrows) {
      try {
        expected = JSON.parse(raw.expectedJson);
      } catch {
        dropped.push(`Test "${name}": expectedJson is not valid JSON.`);
        continue;
      }
    }
    tests.push({ name, args, expected, expectThrows: raw.expectThrows, hidden: raw.hidden });
  }

  const context = dropped.length ? ` after dropping malformed ones: ${dropped.slice(0, 3).join(" ")}` : "";
  return { tests, issues: checkTestMinimums(tests, context), dropped };
}

function declaresFunction(code: string, entry: string) {
  return new RegExp(`\\bfunction\\s+${entry}\\s*[<(]`).test(code);
}

export function checkPracticalStatic(
  question: ModelPracticalQuestion,
  claims: Claims,
  allowedLanguages: readonly CodeLanguage[],
) {
  const issues = checkCommon(question, claims);
  const { entryFunction: entry, starterCode, referenceCode } = question;

  if (!allowedLanguages.includes(question.language)) {
    issues.push(`Language must be one of: ${allowedLanguages.join(", ")}.`);
  }
  if (!IDENTIFIER.test(entry)) {
    issues.push("entryFunction must be a plain identifier.");
  } else {
    if (!declaresFunction(starterCode, entry)) issues.push(`starterCode must declare \`function ${entry}(...)\` at top level.`);
    if (!declaresFunction(referenceCode, entry)) issues.push(`referenceCode must declare \`function ${entry}(...)\` at top level.`);
    if (new RegExp(`\\basync\\s+function\\s+${entry}\\b`).test(referenceCode)) {
      issues.push("The entry function must be synchronous (no async/await).");
    }
  }
  for (const [label, code] of [["starterCode", starterCode], ["referenceCode", referenceCode]] as const) {
    if (code.length > MAX_CODE_CHARS) issues.push(`${label} is too long (max ${MAX_CODE_CHARS} characters).`);
    if (/^\s*(?:import|export)\s|\brequire\s*\(/m.test(code)) {
      issues.push(`${label} must be self-contained: no import, export or require.`);
    }
  }
  if (starterCode.replace(/\s+/g, "") === referenceCode.replace(/\s+/g, "")) {
    issues.push("starterCode must differ from referenceCode.");
  }

  const parsed = parseTestCases(question);
  return { issues: [...issues, ...parsed.issues], tests: parsed.tests, dropped: parsed.dropped.length };
}

export type PracticalCandidate = {
  index: number;
  question: ModelPracticalQuestion;
  tests: TestCase[];
  /** Malformed test cases already dropped while parsing. */
  dropped?: number;
};

export type PracticalVerdict = {
  index: number;
  issues: string[];
  /** The tests that were kept: every one passes against the reference. */
  tests: TestCase[];
  dropped: number;
  reference?: { passed: number; total: number };
  starter?: { passed: number; total: number };
};

/** At most this many tests may be dropped because the reference disagrees with them. */
function maxDisputed(total: number) {
  return Math.max(2, Math.floor(total * 0.25));
}

function failureSummary(run: Extract<TestRun, { ok: true }>) {
  const failed = run.results.filter((result) => !result.passed);
  const summary = failed
    .slice(0, 4)
    .map((result) => `"${result.name}"${result.message ? ` (${result.message})` : result.actual ? ` (got ${result.actual.slice(0, 120)})` : ""}`)
    .join(", ");
  // The commonest model mistake: calling a service that doesn't exist in a pure function.
  const undefinedName = failed.map((result) => result.message?.match(/'([\w$]+)' is not defined/)?.[1]).find(Boolean);
  return undefinedName
    ? `${summary}. "${undefinedName}" doesn't exist in the sandbox: pass that data in as an argument instead`
    : summary;
}

/**
 * Runs every candidate's reference and starter in one sandbox process.
 *
 * Expected values and the reference are written independently, so a test
 * they agree on is confirmed twice. A few disputed tests (where the
 * reference disagrees) are dropped; if more disagree, or the reference
 * crashes, the question fails. On the tests that are kept: the reference
 * passes all of them, the starter fails at least one, and a debugging
 * starter also passes at least one (it's buggy, not empty).
 */
export async function checkPracticalInSandbox(
  candidates: PracticalCandidate[],
  run: (jobs: SandboxJob[]) => Promise<SandboxJobResult[]>,
): Promise<PracticalVerdict[]> {
  const jobs: SandboxJob[] = candidates.flatMap(({ index, question, tests }) => {
    const language = question.language as SandboxLanguage;
    return [
      { id: `${index}:reference`, language, code: buildJsHarness(question.referenceCode, question.entryFunction, tests), timeoutMs: SANDBOX_TIMEOUT_MS },
      { id: `${index}:starter`, language, code: buildJsHarness(question.starterCode, question.entryFunction, tests), timeoutMs: SANDBOX_TIMEOUT_MS },
    ];
  });
  const results = new Map((await run(jobs)).map((result) => [result.id, result]));

  return candidates.map(({ index, question, tests, dropped = 0 }) => {
    const fail = (issues: string[]): PracticalVerdict => ({ index, issues, tests, dropped });
    const referenceResult = results.get(`${index}:reference`);
    const starterResult = results.get(`${index}:starter`);
    if (!referenceResult || !starterResult) return fail(["Sandbox returned no result for this question."]);

    const reference = toTestRun(referenceResult);
    const starter = toTestRun(starterResult);
    if (!reference.ok) {
      return fail([`referenceCode failed to run (${reference.kind}: ${reference.error.slice(0, 200)}).`]);
    }
    if (!starter.ok) {
      return fail([`starterCode failed to run (${starter.kind}: ${starter.error.slice(0, 200)}). It must be valid code.`]);
    }

    const disputed = new Set(reference.results.filter((result) => !result.passed).map((result) => result.name));
    if (disputed.size > maxDisputed(reference.total)) {
      return fail([`referenceCode fails tests ${failureSummary(reference)}. Fix the reference or the expected values.`]);
    }
    const kept = tests.filter((test) => !disputed.has(test.name));
    const minimums = checkTestMinimums(kept, disputed.size ? " once tests the reference fails are removed" : "");
    if (minimums.length) {
      return fail([...minimums, `referenceCode fails tests ${failureSummary(reference)}.`]);
    }

    const starterKept = starter.results.filter((result) => !disputed.has(result.name));
    const starterPassed = starterKept.filter((result) => result.passed).length;
    const issues: string[] = [];
    if (starterPassed === starterKept.length) {
      issues.push("starterCode passes every test; it must fail at least one so the task is meaningful.");
    }
    if (question.type === "debugging" && starterPassed === 0) {
      issues.push("A debugging starter must be a realistic, mostly working implementation that passes at least one test.");
    }
    if (issues.length) return fail(issues);

    return {
      index,
      issues: [],
      tests: kept,
      dropped: dropped + disputed.size,
      reference: { passed: kept.length, total: kept.length },
      starter: { passed: starterPassed, total: starterKept.length },
    };
  });
}

/** Exact per-type counts that an attempt was asked to produce. */
export function checkDistribution(questions: ModelQuestion[], need: SlotNeed) {
  const issues: string[] = [];
  const expectedTotal = totalNeeded(need);
  if (questions.length !== expectedTotal) {
    issues.push(`Return exactly ${expectedTotal} questions (got ${questions.length}).`);
  }
  const practicalCount = questions.filter((question) => question.kind === "practical").length;
  if (practicalCount !== need.practical) {
    issues.push(`Return exactly ${need.practical} practical questions (got ${practicalCount}).`);
  }
  for (const [type, count] of Object.entries(need.written) as [WrittenType, number][]) {
    const got = questions.filter((question) => question.kind === "written" && question.type === type).length;
    if (got !== count) issues.push(`Return exactly ${count} written "${type}" question(s) (got ${got}).`);
  }
  return issues;
}

// Filler that every title shares; similarity should come from the topic.
const TITLE_STOPWORDS = new Set([
  "the", "for", "and", "with", "from", "into", "using", "your", "you", "that", "this",
  "implement", "implementing", "build", "building", "write", "writing", "create", "fix",
  "fixing", "design", "designing", "handle", "handling", "how", "why", "what", "when",
]);

function titleWords(title: string) {
  return new Set(
    (title.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
      .filter((word) => !TITLE_STOPWORDS.has(word))
      .map((word) => word.slice(0, 5)),
  );
}

/** True when two titles are near-duplicates (Jaccard similarity of their words). */
export function isDuplicateTitle(a: string, b: string) {
  const left = titleWords(a);
  const right = titleWords(b);
  if (left.size === 0 || right.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / (left.size + right.size - shared) >= 0.5;
}

/**
 * Splits the tier's minutes across its questions in proportion to the
 * model's suggestions (at least 1 minute each), so the tier totals are exact.
 */
export function allocateMinutes(totalMinutes: number, suggested: number[]) {
  const weights = suggested.map((minutes) => (Number.isFinite(minutes) && minutes > 0 ? minutes : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((weight) => (weight / sum) * totalMinutes);
  const result = raw.map((value) => Math.max(1, Math.floor(value)));
  let remaining = totalMinutes - result.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; remaining > 0; i = (i + 1) % order.length, remaining--) result[order[i].index]++;
  for (let i = result.length - 1; remaining < 0 && i >= 0; i--) {
    while (remaining < 0 && result[i] > 1) {
      result[i]--;
      remaining++;
    }
  }
  return result;
}
