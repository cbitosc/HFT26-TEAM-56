import { describe, expect, it } from "vitest";
import type { Tier } from "@/lib/assessment/config";
import { buildReport, questionCorrectness, skillStatus, verifySkills, type GradingQuestion } from "@/lib/grading/report";
import type { WrittenEvaluation } from "@/lib/grading/written";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 31, 10, minute)).toISOString();

function evaluation(score: number, maxScore = 10): WrittenEvaluation {
  return {
    questionId: "x",
    score,
    maxScore,
    criteria: [{ name: "Correctness", description: "Accurate", points: maxScore, score, justification: "Mostly right." }],
    strengths: ["Clear structure"],
    missingConcepts: ["Idempotency"],
    explanation: "A solid answer that misses idempotency.",
  };
}

function question(index: number, overrides: Partial<GradingQuestion> = {}): GradingQuestion {
  const tier = (["novice", "adept", "master"] as const)[Math.floor(index / 4)] as Tier;
  const practical = index % 4 === 3;
  return {
    id: `q${index}`,
    number: index + 1,
    tier,
    difficulty: ["easy", "medium", "hard"][Math.floor(index / 4)],
    type: practical ? "coding" : "theory",
    kind: practical ? "practical" : "written",
    title: `Question ${index + 1}`,
    skillsTested: practical ? ["TypeScript"] : ["PostgreSQL"],
    language: practical ? "typescript" : null,
    attempted: true,
    executions: practical
      ? [
          { type: "run", outcome: "failed", passed: 1, total: 2, createdAt: at(index), hidden: null },
          { type: "submit", outcome: "failed", passed: 8, total: 10, createdAt: at(index + 1), hidden: { passed: 6, total: 8 } },
        ]
      : [],
    hints: [],
    evaluation: practical ? null : evaluation(7),
    ...overrides,
  };
}

const stages = [
  { tier: "novice" as const, status: "submitted", startedAt: at(0), submittedAt: at(10) },
  { tier: "adept" as const, status: "submitted", startedAt: at(10), submittedAt: at(25) },
  { tier: "master" as const, status: "expired", startedAt: at(25), submittedAt: at(50) },
];

const input = (questions = Array.from({ length: 12 }, (_, i) => question(i))) => ({
  assessment: { status: "expired", startedAt: at(0), completedAt: at(50) },
  questions,
  stages,
  claimedSkills: ["TypeScript", "PostgreSQL", "Kubernetes"],
});

describe("question correctness", () => {
  it("coding uses the graded test pass rate (8 of 10 = 80%), written the rubric", () => {
    expect(questionCorrectness(question(3))).toBe(0.8);
    expect(questionCorrectness(question(0))).toBe(0.7);
    expect(questionCorrectness(question(0, { attempted: false }))).toBe(0);
    expect(questionCorrectness(question(3, { executions: [] }))).toBe(0);
  });
});

describe("buildReport", () => {
  const report = buildReport(input());

  it("scores every question and aggregates stages", () => {
    expect(report.questionResults).toHaveLength(12);
    expect(report.questionResults[3]).toMatchObject({ correctnessPercent: 80, maxScore: 5.83, awardedScore: 4.67, status: "completed" });
    expect(report.stageResults.map((s) => s.percent)).toEqual([72.5, 72.5, 72.5]);
    expect(report.stageResults[0]).toMatchObject({ timeSpentSeconds: 600, attempted: 4 });
    expect(report.correctnessScore).toBe(50.75);
    expect(report.finalScore).toBe(Math.round((report.correctnessScore + report.performanceScore + report.aiEfficiencyScore) * 10) / 10);
  });

  it("never fabricates timings or exposes hidden test details", () => {
    expect(report.questionResults.every((q) => q.timeSpentSeconds === null)).toBe(true);
    expect(report.summary.totalSeconds).toBe(3000);
    const coding = report.questionResults[3];
    expect(coding.tests).toEqual({ passed: 8, total: 10, hidden: { passed: 6, total: 8 }, outcome: "failed" });
    const text = JSON.stringify(report);
    for (const forbidden of ["args", "expected", "reference", "modelAnswer", "keyPoints"]) expect(text).not.toContain(forbidden);
  });

  it("marks unanswered questions and recommends answering them", () => {
    const partial = buildReport(input(Array.from({ length: 12 }, (_, i) => question(i, i === 2 ? { attempted: false, evaluation: null } : {}))));
    expect(partial.questionResults[2]).toMatchObject({ status: "not_attempted", awardedScore: 0, feedback: "Not attempted." });
    expect(partial.summary.questionsCompleted).toBe(11);
    expect(partial.recommendations.join(" ")).toMatch(/unanswered/);
  });

  it("reports AI usage per stage with before/after progress", () => {
    const hinted = buildReport(
      input(
        Array.from({ length: 12 }, (_, i) =>
          i === 7 ? question(i, { hints: [{ createdAt: at(7) }, { createdAt: at(7) }], executions: [
            { type: "run", outcome: "failed", passed: 1, total: 4, createdAt: at(6), hidden: null },
            { type: "submit", outcome: "passed", passed: 10, total: 10, createdAt: at(9), hidden: { passed: 8, total: 8 } },
          ] }) : question(i),
        ),
      ),
    );
    expect(hinted.aiUsage).toMatchObject({ totalHints: 2, hintsByStage: { adept: 2, master: 0 }, neutral: false });
    expect(hinted.aiUsage.progress[0]).toMatchObject({ beforePercent: 25, afterPercent: 100, gainPercent: 100 });
    expect(report.aiUsage.neutral).toBe(true);
    expect(report.aiEfficiencyScore).toBe(20);
  });
});

describe("skills verification", () => {
  it("classifies assessed skills and keeps untested ones separate", () => {
    const skills = verifySkills(["TypeScript", "PostgreSQL", "Kubernetes", "React"], [
      { skillsTested: ["TypeScript generics"], correctness: 0.9 },
      { skillsTested: ["PostgreSQL"], correctness: 0.5 },
      { skillsTested: ["React"], correctness: 0.1 },
      { skillsTested: ["Idempotency"], correctness: 1 },
    ]);
    const byName = Object.fromEntries(skills.map((s) => [s.skill, s]));
    expect(byName.TypeScript).toMatchObject({ status: "demonstrated", claimed: true, questionCount: 1 });
    expect(byName.PostgreSQL.status).toBe("partial");
    expect(byName.React.status).toBe("not_demonstrated");
    // Untested is not failed.
    expect(byName.Kubernetes).toMatchObject({ status: "not_assessed", percent: null });
    expect(byName.Idempotency).toMatchObject({ status: "demonstrated", claimed: false });
    expect([0.7, 0.69, 0.4, 0.39].map((v) => skillStatus(v * 100))).toEqual(["demonstrated", "partial", "partial", "not_demonstrated"]);
  });

  it("works without a résumé", () => {
    expect(verifySkills([], [{ skillsTested: ["Go"], correctness: 1 }])).toEqual([
      { skill: "Go", claimed: false, status: "demonstrated", questionCount: 1, percent: 100 },
    ]);
  });
});
