import { describe, expect, it } from "vitest";
import type { Tier } from "@/lib/assessment/config";
import {
  POINTS,
  aiEfficiencyPoints,
  classify,
  correctnessPoints,
  hintGain,
  performancePoints,
  scoreAssessment,
  stageScores,
  testingScore,
  type ScoringExecution,
  type ScoringQuestion,
} from "@/lib/assessment/scoring";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 31, 10, minute)).toISOString();
const run = (minute: number, passed: number, total = 4, outcome = passed === total ? "passed" : "failed"): ScoringExecution => ({
  type: "run",
  outcome,
  passed,
  total,
  createdAt: at(minute),
});
const graded = (minute: number, passed: number, total = 8, outcome = passed === total ? "passed" : "failed"): ScoringExecution => ({
  type: "submit",
  outcome,
  passed,
  total,
  createdAt: at(minute),
});

function q(overrides: Partial<ScoringQuestion> & { tier?: Tier } = {}): ScoringQuestion {
  return { id: "q", tier: "adept", kind: "practical", attempted: true, correctness: 1, executions: [], hints: [], ...overrides };
}

/** Twelve questions in the standard mix, all with the given correctness. */
function assessment(correctness: number, overrides: (question: ScoringQuestion, index: number) => Partial<ScoringQuestion> = () => ({})) {
  const kinds: ScoringQuestion["kind"][] = ["written", "written", "written", "practical", "written", "written", "practical", "practical", "written", "written", "practical", "practical"];
  return kinds.map((kind, index) => {
    const base = q({ id: `q${index}`, tier: (["novice", "adept", "master"] as const)[Math.floor(index / 4)], kind, correctness });
    return { ...base, ...overrides(base, index) };
  });
}

const submittedStages = [
  { tier: "novice" as const, status: "submitted" },
  { tier: "adept" as const, status: "submitted" },
  { tier: "master" as const, status: "submitted" },
];

describe("correctness (70)", () => {
  it("is 70 × mean question correctness, every question weighted equally", () => {
    expect(correctnessPoints(assessment(1))).toBe(70);
    expect(correctnessPoints(assessment(0.5))).toBe(35);
    // Passing 8 of 10 tests on every question is 80% correctness.
    expect(correctnessPoints(assessment(0.8))).toBe(56);
    expect(correctnessPoints([])).toBe(0);
  });

  it("clamps out-of-range inputs", () => {
    expect(correctnessPoints([q({ correctness: 1.4 }), q({ correctness: -1 })])).toBe(35);
  });

  it("aggregates per stage", () => {
    const questions = assessment(1, (_, index) => (index < 4 ? { correctness: 0.5 } : {}));
    const stages = stageScores(questions);
    expect(stages.map((s) => s.percent)).toEqual([50, 100, 100]);
    expect(stages[0]).toMatchObject({ points: 11.67, maxPoints: 23.33 });
    expect(stages.reduce((sum, s) => sum + s.points, 0)).toBeCloseTo(correctnessPoints(questions), 1);
  });
});

describe("performance (10)", () => {
  it("rewards completion, self-submitted stages and code that runs", () => {
    const questions = assessment(1, (question) => (question.kind === "practical" ? { executions: [graded(5, 8)] } : {}));
    expect(performancePoints(questions, submittedStages)).toEqual({ completion: 4, timeManagement: 3, executionReliability: 3, total: 10 });
  });

  it("doesn't credit stages that ran out, or code that didn't compile, or unanswered questions", () => {
    const questions = assessment(0.5, (question, index) => ({
      attempted: index % 2 === 0,
      executions: question.kind === "practical" ? [graded(5, 0, 8, index === 6 ? "compile_error" : "failed")] : [],
    }));
    const stages = [{ tier: "novice" as const, status: "expired" }, ...submittedStages.slice(1)];
    const score = performancePoints(questions, stages);
    expect(score.completion).toBe(2);
    expect(score.timeManagement).toBe(2);
    // Attempted coding questions 6 and 10: one compiled, one didn't.
    expect(score.executionReliability).toBe(1.5);
  });

  it("is independent of correctness (no double counting)", () => {
    const executions = [graded(5, 0)];
    const wrong = assessment(0, (question) => (question.kind === "practical" ? { executions } : {}));
    const right = assessment(1, (question) => (question.kind === "practical" ? { executions } : {}));
    expect(performancePoints(wrong, submittedStages)).toEqual(performancePoints(right, submittedStages));
  });
});

describe("AI usage efficiency (20)", () => {
  it("gives the full, neutral 20 when no AI was used", () => {
    expect(aiEfficiencyPoints(assessment(0.3))).toMatchObject({ neutral: true, total: 20 });
  });

  it("ignores Novice entirely", () => {
    const novice = q({ tier: "novice", hints: [{ createdAt: at(1) }], correctness: 0 });
    expect(aiEfficiencyPoints([novice, q()])).toMatchObject({ neutral: true, total: 20 });
  });

  it("measures progress after the first hint relative to what was left", () => {
    const question = q({ hints: [{ createdAt: at(5) }], executions: [run(3, 1), run(7, 3), graded(9, 8)] });
    expect(hintGain(question)).toEqual({ before: 0.25, after: 1, gain: 1 });
    const partial = q({ hints: [{ createdAt: at(5) }], executions: [run(3, 2), run(7, 3)] });
    expect(hintGain(partial).gain).toBeCloseTo(0.5);
    const worse = q({ hints: [{ createdAt: at(5) }], executions: [run(3, 3), run(7, 1)] });
    expect(hintGain(worse).gain).toBe(0);
    const alreadyPassing = q({ hints: [{ createdAt: at(5) }], executions: [run(3, 4)] });
    expect(hintGain(alreadyPassing).gain).toBe(1);
  });

  it("scores written questions with hints by the rubric result they reached", () => {
    expect(hintGain(q({ kind: "written", correctness: 0.7, hints: [{ createdAt: at(1) }] }))).toEqual({ before: null, after: 0.7, gain: 0.7 });
  });

  it("never rewards asking for more hints", () => {
    const withHints = (count: number) =>
      aiEfficiencyPoints([q({ hints: Array.from({ length: count }, (_, i) => ({ createdAt: at(i) })), executions: [run(30, 4), graded(31, 8)] })]).total;
    const scores = [1, 2, 3, 4, 6, 10].map(withHints);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    expect(withHints(3)).toBe(20);
  });

  it("rewards purposeful testing over none or excessive runs", () => {
    expect(testingScore(0)).toBe(0.5);
    expect(testingScore(1)).toBe(1);
    expect(testingScore(10)).toBe(1);
    expect(testingScore(20)).toBe(0.5);
    expect(testingScore(100)).toBe(0.3);
  });

  it("normalises across question mixes: a perfect hinted run scores 20 whatever the mix", () => {
    const perfect = (extra: ScoringQuestion[]) =>
      aiEfficiencyPoints([q({ hints: [{ createdAt: at(1) }], executions: [run(2, 4), graded(3, 8)] }), ...extra]).total;
    expect(perfect([])).toBe(20);
    expect(perfect([q({ kind: "written", correctness: 1 }), q({ kind: "written", correctness: 1 })])).toBe(20);
  });
});

describe("final score", () => {
  it("adds the three components, max 100, and classifies by fixed ranges", () => {
    const questions = assessment(1, (question) => (question.kind === "practical" ? { executions: [run(1, 4), graded(5, 8)] } : {}));
    const score = scoreAssessment(questions, submittedStages);
    expect(score.finalScore).toBe(100);
    expect(score.correctness + score.performance.total + score.ai.total).toBe(100);
    expect(POINTS.correctness + POINTS.performance + POINTS.aiEfficiency).toBe(100);
    expect([100, 85, 84.9, 70, 69.9, 50, 49.9, 0].map(classify)).toEqual([
      "excellent",
      "excellent",
      "strong",
      "strong",
      "developing",
      "developing",
      "needs_improvement",
      "needs_improvement",
    ]);
  });

  it("is deterministic", () => {
    const questions = assessment(0.62, (question, index) => ({ hints: index === 5 ? [{ createdAt: at(2) }] : [], executions: question.kind === "practical" ? [run(1, 1), graded(4, 5)] : [] }));
    expect(scoreAssessment(questions, submittedStages)).toEqual(scoreAssessment(questions, submittedStages));
  });
});
