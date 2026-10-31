import { TIERS, type Tier } from "@/lib/assessment/config";

// Vetted scoring, version 1. Pure and deterministic: the same logged data
// always gives the same score, and no model is involved here. (Written
// answers get their correctness from rubric evaluation before this runs.)
//
//   Final (100) = Correctness (70) + Performance (10) + AI usage efficiency (20)
//
// Correctness (70)
//   70 × mean question correctness over all questions. Every question weighs
//   the same (70 / 12 points). Coding: graded tests passed / total (hidden
//   included). Written: rubric points awarded / rubric maximum. Not
//   attempted: 0.
//
// Performance (10), measures how the work was done, not whether it was right:
//   Completion (4)             4 × attempted questions / all questions
//   Time management (3)        3 × stages the candidate submitted themselves
//                              (with at least one attempted answer) / stages.
//                              Stages that ran out of time earn nothing here.
//   Execution reliability (3)  3 × attempted coding questions whose graded
//                              code compiled and ran (passed or failed tests,
//                              no compile/runtime/time/memory error) /
//                              attempted coding questions. 0 with none.
//   Raw execution time isn't scored: interpreter timings vary too much to
//   compare fairly.
//
// AI usage efficiency (20), Adept and Master only (Novice has no AI):
//   No hints at all: the full 20 (neutral; not using AI is never penalised).
//   Otherwise:
//   Progress per hint (10)   10 × mean gain over questions with hints.
//                            Coding: before = best run pass rate before the
//                            first hint (0 if none), after = best pass rate
//                            from then on (runs and graded submission);
//                            gain = (after − before) / (1 − before), floored
//                            at 0, and 1 if it was already passing. Written
//                            (no tests): gain = rubric correctness reached.
//   Testing behaviour (5)    5 × mean over attempted Adept/Master coding
//                            questions of: 1 for 1-10 runs, 0.5 for none,
//                            then 0.05 less per run beyond 10 (floor 0.3).
//                            Full marks when there are no such questions.
//   Hint efficiency (5)      5 × mean over questions with hints of
//                            correctness × min(1, 3 / hints). Up to three
//                            hints per question cost nothing; more hints
//                            never raise the score.
// Means are taken over the questions each part applies to, so the question
// mix doesn't change what a perfect score requires.

export const SCORING_VERSION = 1;

export const POINTS = { correctness: 70, performance: 10, aiEfficiency: 20 } as const;
export const PERFORMANCE_POINTS = { completion: 4, timeManagement: 3, executionReliability: 3 } as const;
export const AI_POINTS = { progressPerHint: 10, testingBehavior: 5, hintEfficiency: 5 } as const;
export const FREE_HINTS_PER_QUESTION = 3;
export const PURPOSEFUL_RUNS = 10;

export type Classification = "excellent" | "strong" | "developing" | "needs_improvement";

export const CLASSIFICATIONS: { min: number; value: Classification; label: string }[] = [
  { min: 85, value: "excellent", label: "Excellent" },
  { min: 70, value: "strong", label: "Strong" },
  { min: 50, value: "developing", label: "Developing" },
  { min: 0, value: "needs_improvement", label: "Needs Improvement" },
];

export type ScoringExecution = {
  type: "run" | "submit" | "auto_submit";
  outcome: string;
  passed: number;
  total: number;
  createdAt: string;
};

export type ScoringQuestion = {
  id: string;
  tier: Tier;
  kind: "practical" | "written";
  attempted: boolean;
  /** 0-1: graded test pass rate or rubric score. 0 when not attempted. */
  correctness: number;
  executions: ScoringExecution[];
  hints: { createdAt: string }[];
};

export type ScoringStage = { tier: Tier; status: string };

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const ratio = (passed: number, total: number) => (total > 0 ? passed / total : 0);
const time = (value: string) => new Date(value).getTime();
export const round2 = (value: number) => Math.round(value * 100) / 100;

const RAN = new Set(["passed", "failed"]);

export function gradedExecution(question: ScoringQuestion) {
  return question.executions.find((execution) => execution.type !== "run") ?? null;
}

export function correctnessPoints(questions: ScoringQuestion[]) {
  return round2(POINTS.correctness * (mean(questions.map((q) => clamp01(q.correctness))) ?? 0));
}

export function performancePoints(questions: ScoringQuestion[], stages: ScoringStage[]) {
  const attempted = questions.filter((q) => q.attempted);
  const completion = questions.length ? PERFORMANCE_POINTS.completion * (attempted.length / questions.length) : 0;

  const stageCount = stages.length || TIERS.length;
  const managed = stages.filter((stage) => stage.status === "submitted" && attempted.some((q) => q.tier === stage.tier)).length;
  const timeManagement = PERFORMANCE_POINTS.timeManagement * (managed / stageCount);

  const coding = attempted.filter((q) => q.kind === "practical");
  const ran = coding.filter((q) => {
    const graded = gradedExecution(q);
    return graded !== null && RAN.has(graded.outcome);
  }).length;
  const executionReliability = coding.length ? PERFORMANCE_POINTS.executionReliability * (ran / coding.length) : 0;

  return {
    completion: round2(completion),
    timeManagement: round2(timeManagement),
    executionReliability: round2(executionReliability),
    total: round2(completion + timeManagement + executionReliability),
  };
}

/** Gain from hints on one question, 0-1 (see the header). */
export function hintGain(question: ScoringQuestion) {
  if (question.kind === "written") return { before: null, after: clamp01(question.correctness), gain: clamp01(question.correctness) };
  const firstHint = Math.min(...question.hints.map((hint) => time(hint.createdAt)));
  let before = 0;
  let after = 0;
  for (const execution of question.executions) {
    const rate = ratio(execution.passed, execution.total);
    if (time(execution.createdAt) < firstHint) {
      if (execution.type === "run") before = Math.max(before, rate);
    } else {
      after = Math.max(after, rate);
    }
  }
  const gain = before >= 1 ? 1 : Math.max(0, after - before) / (1 - before);
  return { before, after, gain: clamp01(gain) };
}

export function testingScore(runs: number) {
  if (runs === 0) return 0.5;
  if (runs <= PURPOSEFUL_RUNS) return 1;
  return Math.max(0.3, 1 - 0.05 * (runs - PURPOSEFUL_RUNS));
}

export function aiEfficiencyPoints(questions: ScoringQuestion[]) {
  const eligible = questions.filter((q) => q.tier !== "novice");
  const hinted = eligible.filter((q) => q.hints.length > 0);
  const totalHints = hinted.reduce((sum, q) => sum + q.hints.length, 0);
  if (totalHints === 0) {
    return {
      neutral: true,
      progressPerHint: AI_POINTS.progressPerHint,
      testingBehavior: AI_POINTS.testingBehavior,
      hintEfficiency: AI_POINTS.hintEfficiency,
      total: POINTS.aiEfficiency,
      totalHints,
    };
  }

  const progressPerHint = AI_POINTS.progressPerHint * (mean(hinted.map((q) => hintGain(q).gain)) ?? 1);
  const coding = eligible.filter((q) => q.kind === "practical" && q.attempted);
  const testingBehavior =
    AI_POINTS.testingBehavior * (mean(coding.map((q) => testingScore(q.executions.filter((e) => e.type === "run").length))) ?? 1);
  const hintEfficiency =
    AI_POINTS.hintEfficiency *
    (mean(hinted.map((q) => clamp01(q.correctness) * Math.min(1, FREE_HINTS_PER_QUESTION / q.hints.length))) ?? 1);

  return {
    neutral: false,
    progressPerHint: round2(progressPerHint),
    testingBehavior: round2(testingBehavior),
    hintEfficiency: round2(hintEfficiency),
    total: round2(progressPerHint + testingBehavior + hintEfficiency),
    totalHints,
  };
}

export function classify(finalScore: number): Classification {
  return (CLASSIFICATIONS.find((range) => finalScore >= range.min) ?? CLASSIFICATIONS[CLASSIFICATIONS.length - 1]).value;
}

/** Per-stage correctness: percent, and that stage's share of the 70 correctness points. */
export function stageScores(questions: ScoringQuestion[]) {
  const perQuestion = questions.length ? POINTS.correctness / questions.length : 0;
  return TIERS.map((tier) => {
    const inTier = questions.filter((q) => q.tier === tier);
    const correctness = mean(inTier.map((q) => clamp01(q.correctness))) ?? 0;
    return {
      tier,
      percent: round2(correctness * 100),
      points: round2(inTier.reduce((sum, q) => sum + clamp01(q.correctness) * perQuestion, 0)),
      maxPoints: round2(inTier.length * perQuestion),
    };
  });
}

export function scoreAssessment(questions: ScoringQuestion[], stages: ScoringStage[]) {
  const correctness = correctnessPoints(questions);
  const performance = performancePoints(questions, stages);
  const ai = aiEfficiencyPoints(questions);
  const finalScore = Math.min(100, Math.round((correctness + performance.total + ai.total) * 10) / 10);
  return { correctness, performance, ai, finalScore, classification: classify(finalScore), stages: stageScores(questions) };
}
