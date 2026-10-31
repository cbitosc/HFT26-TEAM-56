import "server-only";
import { stripTypeScriptTypes } from "node:module";
import { AiError, generateStructured } from "@/lib/ai/client";
import {
  LANGUAGE_FILE,
  LANGUAGE_LABEL,
  SANDBOX_LANGUAGES,
  TIER_CONFIG,
  TIERS,
  type CodeLanguage,
  type GenerationStage,
  type SlotNeed,
  type Tier,
  type WrittenType,
} from "@/lib/assessment/config";
import { buildClaims, claimsLanguage, type Claims } from "@/lib/assessment/grounding";
import { focusAreas, tierSystemPrompt, tierUserPrompt } from "@/lib/assessment/prompts";
import {
  tierOutputSchema,
  type GeneratedQuestion,
  type ModelPracticalQuestion,
  type ModelWrittenQuestion,
  type PracticalQuestion,
  type WrittenQuestion,
} from "@/lib/assessment/schemas";
import { templatesFor, type ChallengeTemplate } from "@/lib/assessment/templates";
import {
  allocateMinutes,
  checkDistribution,
  checkPracticalInSandbox,
  checkPracticalStatic,
  checkWrittenQuestion,
  isDuplicateTitle,
  type PracticalCandidate,
  type PracticalVerdict,
} from "@/lib/assessment/validate";
import { isSandboxAvailable, runSandboxJobs } from "@/lib/sandbox/quickjs";
import type { ResumeProfile } from "@/lib/resumes/schemas";

export type GenerationErrorCode = "unsupported_languages" | "generation_failed" | "ai_unavailable";

export class GenerationError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GenerationError";
  }
}

/** Extra time the cross-tier replacement step may use past the main budget. */
const REPLACEMENT_GRACE_MS = 50_000;
/**
 * Extra model calls for a tier whose written questions are still missing
 * after the normal attempts, if the time budget allows. Written questions
 * have no template fallback, so one stubborn slot would otherwise fail the
 * whole assessment. These calls ask only for the missing written slots.
 */
const EXTRA_WRITTEN_ATTEMPTS = 2;

/** Retry guidance appended when a question named a technology the candidate doesn't claim. */
function claimedTechnologyHint(profile: ResumeProfile) {
  const claimed = [
    ...profile.programmingLanguages,
    ...profile.frameworksAndLibraries,
    ...profile.databases,
    ...profile.developerTools,
  ];
  return claimed.length
    ? `Only name technologies from this list: ${claimed.join(", ")}. Don't name any other language, framework, library, database or tool anywhere in the question, not even as a comparison or an alternative.`
    : "Don't name any specific language, framework, library, database or tool the candidate doesn't claim.";
}

export type GenerationDeps = {
  ai: typeof generateStructured;
  runSandbox: typeof runSandboxJobs;
  sandboxAvailable: () => Promise<boolean>;
  now: () => number;
};

const defaultDeps: GenerationDeps = {
  ai: generateStructured,
  runSandbox: runSandboxJobs,
  sandboxAvailable: isSandboxAvailable,
  now: Date.now,
};

export type GenerationOptions = {
  /** Model calls per tier, including the first. */
  maxAttempts?: number;
  /** Overall budget; no new attempts start after it. */
  budgetMs?: number;
  /** Called as generation moves forward (never backwards) through its stages. */
  onStage?: (stage: GenerationStage) => void;
};

export type GenerationResult = {
  questions: GeneratedQuestion[];
  model: string | null;
  log: string[];
};

type Plan = {
  /** Languages the model may use for practical questions (validated in the sandbox). */
  aiLanguages: CodeLanguage[];
  /** Language for prevalidated templates, when needed. */
  templateLanguage: CodeLanguage | null;
};

function plan(claims: Claims, sandboxReady: boolean): Plan {
  const claimed = SANDBOX_LANGUAGES.filter((language) => claimsLanguage(language, claims));
  // Prefer TypeScript when claimed: it's a superset and the more specific claim.
  const ordered = claimed.includes("typescript") ? (["typescript", ...claimed.filter((l) => l !== "typescript")] as CodeLanguage[]) : [...claimed];
  const templateLanguage: CodeLanguage | null = ordered[0] ?? (claimsLanguage("python", claims) ? "python" : null);
  return { aiLanguages: sandboxReady ? ordered : [], templateLanguage };
}

function uniqueStrings(values: string[], max: number) {
  const seen = new Set<string>();
  return values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value && !seen.has(value.toLowerCase()) && seen.add(value.toLowerCase()))
    .slice(0, max);
}

function toWritten(tier: Tier, question: ModelWrittenQuestion): WrittenQuestion {
  return {
    tier,
    difficulty: TIER_CONFIG[tier].difficulty,
    kind: "written",
    type: question.type,
    title: question.title.trim(),
    statement: question.statement.trim(),
    resumeEvidence: uniqueStrings(question.resumeEvidence, 5),
    skillsTested: uniqueStrings(question.skillsTested, 6),
    timeMinutes: question.timeMinutes,
    rubric: {
      modelAnswer: question.rubric.modelAnswer.trim(),
      keyPoints: uniqueStrings(question.rubric.keyPoints, 8),
      criteria: question.rubric.criteria.slice(0, 6),
      redFlags: uniqueStrings(question.rubric.redFlags, 8),
    },
  };
}

function toPractical(tier: Tier, candidate: PracticalCandidate, verdict: PracticalVerdict): PracticalQuestion {
  const { question } = candidate;
  const reference = verdict.reference!;
  const starter = verdict.starter!;
  const tests = verdict.tests;
  return {
    tier,
    difficulty: TIER_CONFIG[tier].difficulty,
    kind: "practical",
    type: question.type,
    title: question.title.trim(),
    statement: question.statement.trim(),
    resumeEvidence: uniqueStrings(question.resumeEvidence, 5),
    skillsTested: uniqueStrings(question.skillsTested, 6),
    timeMinutes: question.timeMinutes,
    language: question.language,
    entryFunction: question.entryFunction,
    starterCode: question.starterCode,
    referenceCode: question.referenceCode,
    tests,
    gradingNotes: question.gradingNotes.trim(),
    source: "ai",
    validation: {
      method: "sandbox",
      runtime: "quickjs-wasm",
      reference: { passed: reference.passed, total: reference.total },
      starter: { passed: starter.passed, total: starter.total },
      droppedTests: verdict.dropped,
      validatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Résumé framing for a template: the candidate's project or role that best
 * matches the task (by keywords), preferring ones built in the language.
 */
function templateContext(profile: ResumeProfile, language: CodeLanguage, template: ChallengeTemplate) {
  const label = LANGUAGE_LABEL[language];
  const usesLanguage = (technologies: string[]) =>
    technologies.some(
      (tech) => tech.toLowerCase() === label.toLowerCase() || (language === "javascript" && /typescript|node/i.test(tech)),
    );
  const relevance = (text: string) =>
    template.keywords.filter((keyword) => text.toLowerCase().includes(keyword)).length;
  const score = (text: string, technologies: string[]) => relevance(text) * 2 + (usesLanguage(technologies) ? 1 : 0);

  const project = [...profile.projects].sort(
    (a, b) =>
      score(`${b.name} ${b.description} ${b.responsibilities.join(" ")}`, b.technologies) -
      score(`${a.name} ${a.description} ${a.responsibilities.join(" ")}`, a.technologies),
  )[0];
  const role = [...profile.experience].sort(
    (a, b) => score(`${b.role} ${b.highlights.join(" ")}`, b.technologies) - score(`${a.role} ${a.highlights.join(" ")}`, a.technologies),
  )[0];

  if (project) {
    return {
      context: `This task is modelled on the kind of ${label} logic behind your project ${project.name}${project.technologies.length ? ` (${project.technologies.slice(0, 4).join(", ")})` : ""}.`,
      evidence: [`${label} listed under programming languages`, `Project ${project.name}: ${project.description.slice(0, 140)}`],
    };
  }
  if (role) {
    return {
      context: `This task reflects day-to-day ${label} work like your role as ${role.role}${role.organization ? ` at ${role.organization}` : ""}.`,
      evidence: [`${label} listed under programming languages`, `${role.role}${role.organization ? `, ${role.organization}` : ""}`],
    };
  }
  return { context: `You list ${label} on your résumé.`, evidence: [`${label} listed under programming languages`] };
}

function fromTemplate(
  tier: Tier,
  template: ChallengeTemplate,
  language: CodeLanguage,
  profile: ResumeProfile,
  minutes: number,
): PracticalQuestion {
  const { context, evidence } = templateContext(profile, language, template);
  const source = language === "python" ? "python" : "typescript";
  const toJs = (code: string) => (language === "javascript" ? stripTypeScriptTypes(code, { mode: "transform" }) : code);
  return {
    tier,
    difficulty: TIER_CONFIG[tier].difficulty,
    kind: "practical",
    type: template.type,
    title: template.title,
    statement: template.statement(context, source),
    resumeEvidence: evidence,
    skillsTested: [LANGUAGE_LABEL[language]],
    timeMinutes: minutes,
    language,
    entryFunction: template.entry[source],
    starterCode: toJs(template.starter[source]),
    referenceCode: toJs(template.reference[source]),
    tests: template.tests,
    gradingNotes: "Prevalidated challenge: correctness is measured by the visible and hidden tests.",
    source: "template",
    validation: {
      method: "template",
      templateId: template.id,
      prevalidated: true,
      validatedAt: new Date().toISOString(),
    },
  };
}

type TierPool = {
  written: Map<WrittenType, WrittenQuestion[]>;
  practical: PracticalQuestion[];
};

function titles(pool: TierPool) {
  return [...[...pool.written.values()].flat(), ...pool.practical].map((question) => question.title);
}

/** Picks `count` practical questions, mixing coding and debugging where the tier allows both. */
function pickPractical(tier: Tier, available: PracticalQuestion[], count: number) {
  if (available.length < count) return null;
  const mixed = TIER_CONFIG[tier].practicalTypes.length > 1;
  const picked: PracticalQuestion[] = [];
  for (const question of available) {
    if (picked.length >= count) break;
    const sameAsFirst = picked.length === 1 && picked[0].type === question.type;
    const alternativeExists = available.some((q) => !picked.includes(q) && q.type !== picked[0]?.type);
    if (mixed && sameAsFirst && alternativeExists) continue;
    picked.push(question);
  }
  for (const question of available) {
    if (picked.length >= count) break;
    if (!picked.includes(question)) picked.push(question);
  }
  return picked;
}

/** Picks the tier's questions from validated pool entries, or null if a slot is still empty. */
function assemble(tier: Tier, pool: TierPool, practicalNeeded: number) {
  const chosen: GeneratedQuestion[] = [];
  for (const [type, count] of Object.entries(TIER_CONFIG[tier].written) as [WrittenType, number][]) {
    const available = pool.written.get(type) ?? [];
    if (available.length < count) return null;
    chosen.push(...available.slice(0, count));
  }
  const practical = pickPractical(tier, pool.practical, practicalNeeded);
  return practical ? [...chosen, ...practical] : null;
}

async function generateTier(
  tier: Tier,
  profile: ResumeProfile,
  claims: Claims,
  planned: Plan,
  deps: GenerationDeps,
  context: {
    deadline: number;
    maxAttempts: number;
    avoidTitles: string[];
    log: string[];
    models: Set<string>;
    focus: Record<Tier, string[]>;
    draftReceived: (tier: Tier) => void;
  },
  /** Already-validated questions to keep; only the remaining slots are generated. */
  seed: GeneratedQuestion[] = [],
): Promise<GeneratedQuestion[]> {
  const config = TIER_CONFIG[tier];
  const practicalFromAi = planned.aiLanguages.length ? config.practical : 0;
  const pool: TierPool = { written: new Map(), practical: [] };
  for (const question of seed) {
    if (question.kind === "practical") pool.practical.push(question);
    else pool.written.set(question.type, [...(pool.written.get(question.type) ?? []), question]);
  }
  let feedback: string[] = [];
  let lastRequestError: AiError | null = null;

  const isNew = (title: string) =>
    ![...titles(pool), ...context.avoidTitles].some((existing) => isDuplicateTitle(existing, title));

  // Slots not yet filled by a validated question. Retries ask only for these.
  const remaining = (): SlotNeed => ({
    written: Object.fromEntries(
      (Object.entries(config.written) as [WrittenType, number][]).map(([type, count]) => [
        type,
        Math.max(0, count - (pool.written.get(type)?.length ?? 0)),
      ]),
    ),
    practical: Math.max(0, practicalFromAi - pool.practical.length),
  });

  const writtenMissing = () => Object.values(remaining().written).some((count) => (count ?? 0) > 0);

  for (let attempt = 1; attempt <= context.maxAttempts + EXTRA_WRITTEN_ATTEMPTS; attempt++) {
    // Past the normal attempts, keep going only for missing written slots;
    // practical slots fall back to templates after the loop.
    const overtime = attempt > context.maxAttempts;
    if (overtime && !writtenMissing()) break;
    if (attempt > 1 && deps.now() > context.deadline) {
      context.log.push(`${tier}: out of time after ${attempt - 1} attempt(s)`);
      break;
    }

    const need = overtime ? { ...remaining(), practical: 0 } : remaining();
    let output;
    try {
      output = await deps.ai({
        name: `${tier}_questions`,
        schema: tierOutputSchema(tier, need.practical ? planned.aiLanguages : []),
        system: tierSystemPrompt(tier, need.practical ? planned.aiLanguages : [], need),
        user: tierUserPrompt({
          tier,
          profile,
          avoidTitles: [...context.avoidTitles, ...titles(pool)],
          feedback,
          focus: context.focus[tier],
        }),
        maxTokens: 16_000,
        // Never let one slow call run far past the overall budget.
        timeoutMs: Math.min(150_000, Math.max(45_000, context.deadline - deps.now() + 30_000)),
        temperature: 0.3,
      });
    } catch (error) {
      if (!(error instanceof AiError) || error.code === "not_configured") throw error;
      if (error.code === "invalid_response") {
        feedback = ["Your reply was not valid JSON for the schema. Follow the schema exactly."];
      }
      // Timeouts, rate limits and 5xx are transient: spend an attempt, keep going.
      context.log.push(`${tier} attempt ${attempt}: ${error.code === "invalid_response" ? "invalid JSON" : "request failed"}`);
      lastRequestError = error;
      context.draftReceived(tier);
      continue;
    }
    context.models.add(output.model);
    context.draftReceived(tier);

    const questions = output.data.questions;
    const issues: string[] = checkDistribution(questions, need);
    const practicalCandidates: PracticalCandidate[] = [];

    questions.forEach((question, index) => {
      const label = `Question ${index + 1} ("${question.title.slice(0, 60)}")`;
      if (!isNew(question.title)) {
        issues.push(`${label} duplicates another question; write a different one.`);
        return;
      }
      if (question.kind === "written") {
        const problems = checkWrittenQuestion(question, claims);
        if (problems.length) issues.push(...problems.map((problem) => `${label}: ${problem}`));
        else {
          const list = pool.written.get(question.type) ?? [];
          list.push(toWritten(tier, question));
          pool.written.set(question.type, list);
        }
        return;
      }
      if (!need.practical) return;
      const { issues: problems, tests, dropped } = checkPracticalStatic(question as ModelPracticalQuestion, claims, planned.aiLanguages);
      if (problems.length) issues.push(...problems.map((problem) => `${label}: ${problem}`));
      else practicalCandidates.push({ index, question: question as ModelPracticalQuestion, tests, dropped });
    });

    if (practicalCandidates.length) {
      try {
        const verdicts = await checkPracticalInSandbox(practicalCandidates, deps.runSandbox);
        for (const verdict of verdicts) {
          const candidate = practicalCandidates.find((c) => c.index === verdict.index)!;
          const label = `Question ${verdict.index + 1} ("${candidate.question.title.slice(0, 60)}")`;
          if (verdict.issues.length || !verdict.reference || !verdict.starter) {
            issues.push(...verdict.issues.map((problem) => `${label}: ${problem}`));
          } else if (isNew(candidate.question.title)) {
            pool.practical.push(toPractical(tier, candidate, verdict));
            if (verdict.dropped) {
              context.log.push(`${tier}: kept "${candidate.question.title.slice(0, 50)}" after dropping ${verdict.dropped} malformed or disputed test(s)`);
            }
          }
        }
      } catch (error) {
        context.log.push(`${tier} attempt ${attempt}: sandbox error ${(error as Error).message}`);
        issues.push("Internal sandbox error while checking practical questions.");
      }
    }

    context.log.push(
      `${tier} attempt ${attempt}: ${issues.length} issue(s)${issues.length ? ` e.g. ${issues.slice(0, 3).join(" | ").slice(0, 600)}` : ""}`,
    );
    const assembled = assemble(tier, pool, practicalFromAi);
    if (assembled) return completeWithTemplates(tier, assembled, profile, planned, context.log);
    feedback = issues.some((issue) => issue.includes("which the candidate doesn't claim"))
      ? [...issues, claimedTechnologyHint(profile)]
      : issues;
  }

  // Written slots must come from the model; practical slots can fall back to
  // prevalidated templates.
  const written = assemble(tier, pool, 0);
  if (!written && lastRequestError?.code === "request_failed" && !feedback.length) {
    throw new GenerationError("ai_unavailable", `${config.label}: the model didn't respond`, { cause: lastRequestError });
  }
  if (!written) {
    throw new GenerationError(
      "generation_failed",
      `Couldn't produce valid ${config.label} written questions. Last issues: ${feedback.slice(0, 5).join(" | ")}`,
    );
  }
  const kept = pickPractical(tier, pool.practical, Math.min(pool.practical.length, config.practical)) ?? [];
  return completeWithTemplates(tier, [...written, ...kept], profile, planned, context.log);
}

/** Tops up the tier's practical slots with prevalidated templates, if any are missing. */
function completeWithTemplates(
  tier: Tier,
  questions: GeneratedQuestion[],
  profile: ResumeProfile,
  planned: Plan,
  log: string[],
): GeneratedQuestion[] {
  const config = TIER_CONFIG[tier];
  const practical = questions.filter((question): question is PracticalQuestion => question.kind === "practical");
  const needed = config.practical - practical.length;
  if (needed <= 0) return questions;
  if (!planned.templateLanguage) {
    throw new GenerationError("unsupported_languages", "No supported language for practical questions.");
  }

  // Prefer templates on a different topic from the tier's existing
  // questions, then ones whose type complements the practical ones.
  const haveTypes = new Set(practical.map((question) => question.type));
  const existingText = questions.map((question) => `${question.title} ${question.statement}`).join(" ").toLowerCase();
  const topicOverlap = (template: ChallengeTemplate) =>
    template.keywords.filter((keyword) => existingText.includes(keyword)).length;
  const templates = templatesFor(tier)
    .filter((template) => !practical.some((question) => question.title === template.title))
    .sort(
      (a, b) =>
        topicOverlap(a) - topicOverlap(b) || Number(haveTypes.has(a.type)) - Number(haveTypes.has(b.type)),
    );
  if (templates.length < needed) {
    throw new GenerationError("generation_failed", `Not enough validated ${config.label} practical questions.`);
  }
  const filled = templates
    .slice(0, needed)
    .map((template) => fromTemplate(tier, template, planned.templateLanguage!, profile, 5));
  log.push(`${tier}: ${needed} practical question(s) from prevalidated templates (${planned.templateLanguage})`);
  return [...questions, ...filled];
}

/**
 * Generates and validates a full 12-question assessment for the profile.
 * Throws GenerationError when it can't produce a fully validated set.
 */
export async function generateAssessment(
  profile: ResumeProfile,
  depsOverride: Partial<GenerationDeps> = {},
  options: GenerationOptions = {},
): Promise<GenerationResult> {
  const deps = { ...defaultDeps, ...depsOverride };
  const log: string[] = [];
  const claims = buildClaims(profile);

  const claimsSandboxLanguage = SANDBOX_LANGUAGES.some((language) => claimsLanguage(language, claims));
  const sandboxReady = claimsSandboxLanguage ? await deps.sandboxAvailable() : false;
  const planned = plan(claims, sandboxReady);
  log.push(`plan: ai=${planned.aiLanguages.join(",") || "none"} template=${planned.templateLanguage ?? "none"} sandbox=${sandboxReady}`);

  if (!planned.aiLanguages.length && !planned.templateLanguage) {
    throw new GenerationError(
      "unsupported_languages",
      "Practical questions need JavaScript, TypeScript or Python on the résumé.",
    );
  }

  const drafted = new Set<Tier>();
  const context = {
    deadline: deps.now() + (options.budgetMs ?? 170_000),
    maxAttempts: options.maxAttempts ?? 4,
    avoidTitles: [] as string[],
    log,
    models: new Set<string>(),
    focus: focusAreas(profile),
    draftReceived: (tier: Tier) => {
      if (drafted.has(tier)) return;
      drafted.add(tier);
      // Every tier has its first draft back: from here on it's validation and fixes.
      if (drafted.size === TIERS.length) options.onStage?.("validating");
    },
  };

  options.onStage?.("generating");
  let byTier: GeneratedQuestion[][];
  try {
    byTier = await Promise.all(TIERS.map((tier) => generateTier(tier, profile, claims, planned, deps, context)));
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    if (error instanceof AiError) {
      throw new GenerationError("ai_unavailable", error.message, { cause: error });
    }
    throw error;
  }

  // Tiers run in parallel, so check for cross-tier repeats (same kind of
  // question on the same topic) and replace only those, keeping the rest of
  // the tier. This step gets a short grace period; if a replacement still
  // can't be produced, the original question stays rather than discarding a
  // fully validated assessment.
  const graceDeadline = context.deadline + REPLACEMENT_GRACE_MS;
  for (let i = 1; i < TIERS.length; i++) {
    const earlier = byTier.slice(0, i).flat();
    const repeats = byTier[i].filter((question) =>
      earlier.some((other) => other.kind === question.kind && isDuplicateTitle(other.title, question.title)),
    );
    if (!repeats.length) continue;

    const kept = byTier[i].filter((question) => !repeats.includes(question));
    log.push(`${TIERS[i]}: replacing ${repeats.length} question(s) that repeat an earlier tier`);
    try {
      byTier[i] = await generateTier(
        TIERS[i],
        profile,
        claims,
        planned,
        deps,
        {
          ...context,
          deadline: Math.max(context.deadline, Math.min(graceDeadline, deps.now() + REPLACEMENT_GRACE_MS)),
          maxAttempts: 2,
          avoidTitles: [...earlier.map((question) => question.title), ...repeats.map((question) => question.title)],
        },
        kept,
      );
    } catch (error) {
      if (!(error instanceof GenerationError)) throw error;
      log.push(`${TIERS[i]}: couldn't replace in time, keeping the original question(s)`);
    }
  }

  const questions = byTier.flatMap((tierQuestions, tierIndex) => {
    const tier = TIERS[tierIndex];
    const minutes = allocateMinutes(TIER_CONFIG[tier].minutes, tierQuestions.map((question) => question.timeMinutes));
    return tierQuestions.map((question, index) => ({ ...question, timeMinutes: minutes[index] }));
  });

  return { questions, model: [...context.models][0] ?? null, log };
}

export function starterFileName(language: CodeLanguage) {
  return LANGUAGE_FILE[language];
}
