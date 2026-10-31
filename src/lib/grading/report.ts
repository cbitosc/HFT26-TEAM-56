import { TIER_CONFIG, TIERS, type Tier } from "@/lib/assessment/config";
import {
  AI_POINTS,
  CLASSIFICATIONS,
  FREE_HINTS_PER_QUESTION,
  PERFORMANCE_POINTS,
  POINTS,
  PURPOSEFUL_RUNS,
  SCORING_VERSION,
  hintGain,
  round2,
  scoreAssessment,
  type Classification,
  type ScoringExecution,
  type ScoringQuestion,
} from "@/lib/assessment/scoring";
import type { WrittenEvaluation } from "@/lib/grading/written";

// Builds the candidate-facing report from graded data. Pure: everything it
// needs is passed in, and nothing secret is (no hidden test inputs or
// expected values, no reference code, no model answers). Only metrics that
// were actually recorded are reported; per-question time isn't tracked, so
// it's reported as null.

export type GradingQuestion = {
  id: string;
  number: number;
  tier: Tier;
  difficulty: string;
  type: string;
  kind: "practical" | "written";
  title: string;
  skillsTested: string[];
  language: string | null;
  attempted: boolean;
  /** All executions, oldest first. Graded ones carry hidden-test counts. */
  executions: (ScoringExecution & { hidden: { passed: number; total: number } | null })[];
  hints: { createdAt: string }[];
  /** Written questions that were answered. */
  evaluation: WrittenEvaluation | null;
};

export type GradingStage = { tier: Tier; status: string; startedAt: string | null; submittedAt: string | null };

export type GradingInput = {
  assessment: { status: string; startedAt: string | null; completedAt: string | null };
  questions: GradingQuestion[];
  stages: GradingStage[];
  /** Technical skills claimed on the résumé; empty if the résumé is gone. */
  claimedSkills: string[];
};

export type QuestionResult = {
  questionId: string;
  number: number;
  title: string;
  tier: Tier;
  difficulty: string;
  type: string;
  kind: "practical" | "written";
  language: string | null;
  skillsTested: string[];
  status: "completed" | "not_attempted";
  maxScore: number;
  awardedScore: number;
  correctnessPercent: number;
  /** Not tracked per question. */
  timeSpentSeconds: null;
  hintsUsed: number;
  tests: { passed: number; total: number; hidden: { passed: number; total: number } | null; outcome: string } | null;
  executions: { runs: number; compileErrors: number; runtimeErrors: number; timeouts: number; passRates: number[] } | null;
  rubric: WrittenEvaluation["criteria"] | null;
  strengths: string[];
  missingConcepts: string[];
  feedback: string;
};

export type SkillStatus = "demonstrated" | "partial" | "not_demonstrated" | "not_assessed";

export type SkillResult = {
  skill: string;
  claimed: boolean;
  status: SkillStatus;
  questionCount: number;
  /** Mean correctness of the questions that assessed it, 0-100; null when not assessed. */
  percent: number | null;
};

export type Report = ReturnType<typeof buildReport>;

const OUTCOME_FEEDBACK: Record<string, string> = {
  compile_error: "The submitted code didn't compile.",
  runtime_error: "The submitted code failed at runtime.",
  timeout: "The submitted code exceeded the time limit.",
  memory_limit: "The submitted code exceeded the memory limit.",
  output_limit: "The submitted code printed too much output.",
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();

/** "TypeScript" matches "TypeScript generics", "Node.js" matches "node.js streams". */
function skillMatches(claimed: string, tested: string) {
  const a = normalize(claimed);
  const b = normalize(tested);
  if (!a || !b) return false;
  if (a === b) return true;
  const words = (s: string) => ` ${s} `;
  return words(b).includes(words(a)) || words(a).includes(words(b));
}

export function skillStatus(percent: number): Exclude<SkillStatus, "not_assessed"> {
  if (percent >= 70) return "demonstrated";
  if (percent >= 40) return "partial";
  return "not_demonstrated";
}

export function verifySkills(claimedSkills: string[], questions: { skillsTested: string[]; correctness: number }[]): SkillResult[] {
  const results: SkillResult[] = [];
  const seen = new Set<string>();
  const evaluate = (skill: string, claimed: boolean) => {
    const key = normalize(skill);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const matched = questions.filter((q) => q.skillsTested.some((tested) => skillMatches(skill, tested)));
    if (!matched.length) {
      results.push({ skill, claimed, status: "not_assessed", questionCount: 0, percent: null });
      return;
    }
    const percent = round2((matched.reduce((sum, q) => sum + q.correctness, 0) / matched.length) * 100);
    results.push({ skill, claimed, status: skillStatus(percent), questionCount: matched.length, percent });
  };
  for (const skill of claimedSkills) evaluate(skill, true);
  // Concepts the questions assessed that aren't on the résumé list as such.
  for (const question of questions) {
    for (const tested of question.skillsTested) {
      if (!claimedSkills.some((claimed) => skillMatches(claimed, tested))) evaluate(tested, false);
    }
  }
  const order: Record<SkillStatus, number> = { demonstrated: 0, partial: 1, not_demonstrated: 2, not_assessed: 3 };
  return results.sort((a, b) => order[a.status] - order[b.status] || Number(b.claimed) - Number(a.claimed));
}

/** Correctness of a question, 0-1, from its graded tests or rubric evaluation. */
export function questionCorrectness(question: GradingQuestion) {
  if (!question.attempted) return 0;
  if (question.kind === "written") {
    return question.evaluation && question.evaluation.maxScore > 0 ? question.evaluation.score / question.evaluation.maxScore : 0;
  }
  const graded = question.executions.find((e) => e.type !== "run");
  return graded && graded.total > 0 ? graded.passed / graded.total : 0;
}

const seconds = (from: string | null, to: string | null) =>
  from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)) : null;

export function buildReport(input: GradingInput) {
  const scoring: ScoringQuestion[] = input.questions.map((q) => ({
    id: q.id,
    tier: q.tier,
    kind: q.kind,
    attempted: q.attempted,
    correctness: questionCorrectness(q),
    executions: q.executions,
    hints: q.hints,
  }));
  const score = scoreAssessment(scoring, input.stages);
  const perQuestion = input.questions.length ? POINTS.correctness / input.questions.length : 0;

  const questionResults: QuestionResult[] = input.questions.map((q, index) => {
    const correctness = scoring[index].correctness;
    const runs = q.executions.filter((e) => e.type === "run");
    const graded = q.executions.find((e) => e.type !== "run") ?? null;
    let feedback: string;
    if (!q.attempted) feedback = "Not attempted.";
    else if (q.kind === "written") feedback = q.evaluation?.explanation ?? "Evaluated against the rubric.";
    else if (!graded) feedback = "No graded submission was recorded.";
    else
      feedback =
        OUTCOME_FEEDBACK[graded.outcome] ??
        `Passed ${graded.passed} of ${graded.total} grading tests${graded.hidden ? `, including ${graded.hidden.passed} of ${graded.hidden.total} hidden tests` : ""}.`;
    return {
      questionId: q.id,
      number: q.number,
      title: q.title,
      tier: q.tier,
      difficulty: q.difficulty,
      type: q.type,
      kind: q.kind,
      language: q.language,
      skillsTested: q.skillsTested,
      status: q.attempted ? "completed" : "not_attempted",
      maxScore: round2(perQuestion),
      awardedScore: round2(perQuestion * correctness),
      correctnessPercent: round2(correctness * 100),
      timeSpentSeconds: null,
      hintsUsed: q.hints.length,
      tests: q.kind === "practical" && graded ? { passed: graded.passed, total: graded.total, hidden: graded.hidden, outcome: graded.outcome } : null,
      executions:
        q.kind === "practical"
          ? {
              runs: runs.length,
              compileErrors: q.executions.filter((e) => e.outcome === "compile_error").length,
              runtimeErrors: q.executions.filter((e) => e.outcome === "runtime_error").length,
              timeouts: q.executions.filter((e) => e.outcome === "timeout" || e.outcome === "memory_limit").length,
              passRates: runs.map((e) => round2(e.total ? (e.passed / e.total) * 100 : 0)),
            }
          : null,
      rubric: q.evaluation?.criteria ?? null,
      strengths: q.evaluation?.strengths ?? [],
      missingConcepts: q.evaluation?.missingConcepts ?? [],
      feedback,
    };
  });

  const stageResults = TIERS.map((tier) => {
    const stage = input.stages.find((s) => s.tier === tier);
    const inTier = questionResults.filter((q) => q.tier === tier);
    const stageScore = score.stages.find((s) => s.tier === tier)!;
    return {
      tier,
      label: TIER_CONFIG[tier].label,
      difficulty: TIER_CONFIG[tier].difficulty,
      percent: stageScore.percent,
      points: stageScore.points,
      maxPoints: stageScore.maxPoints,
      attempted: inTier.filter((q) => q.status === "completed").length,
      questionCount: inTier.length,
      hints: inTier.reduce((sum, q) => sum + q.hintsUsed, 0),
      status: stage?.status ?? "expired",
      timeSpentSeconds: seconds(stage?.startedAt ?? null, stage?.submittedAt ?? null),
      timeLimitMinutes: TIER_CONFIG[tier].minutes,
    };
  });

  const hinted = input.questions.filter((q) => q.tier !== "novice" && q.hints.length > 0);
  const aiUsage = {
    neutral: score.ai.neutral,
    totalHints: score.ai.totalHints,
    hintsByStage: { adept: stageResults[1]?.hints ?? 0, master: stageResults[2]?.hints ?? 0 },
    totalRuns: input.questions.reduce((sum, q) => sum + q.executions.filter((e) => e.type === "run").length, 0),
    progress: hinted.map((q) => {
      const gain = hintGain(scoring[input.questions.indexOf(q)]);
      return {
        questionId: q.id,
        number: q.number,
        title: q.title,
        kind: q.kind,
        hints: q.hints.length,
        beforePercent: gain.before === null ? null : round2(gain.before * 100),
        afterPercent: round2(gain.after * 100),
        gainPercent: round2(gain.gain * 100),
      };
    }),
  };

  const skillsVerification = verifySkills(
    input.claimedSkills,
    input.questions.map((q, index) => ({ skillsTested: q.skillsTested, correctness: scoring[index].correctness })),
  );

  const attempted = questionResults.filter((q) => q.status === "completed").length;
  const report = {
    scoringVersion: SCORING_VERSION,
    correctnessScore: score.correctness,
    performanceScore: score.performance.total,
    aiEfficiencyScore: score.ai.total,
    finalScore: score.finalScore,
    classification: score.classification,
    summary: {
      questionsCompleted: attempted,
      questionCount: questionResults.length,
      totalSeconds: seconds(input.assessment.startedAt, input.assessment.completedAt),
      endedBy: input.assessment.status === "expired" ? "time" : "submission",
      startedAt: input.assessment.startedAt,
      completedAt: input.assessment.completedAt,
    },
    scoreBreakdown: {
      correctness: { points: score.correctness, max: POINTS.correctness },
      performance: { ...score.performance, max: POINTS.performance, parts: PERFORMANCE_POINTS },
      aiEfficiency: {
        progressPerHint: score.ai.progressPerHint,
        testingBehavior: score.ai.testingBehavior,
        hintEfficiency: score.ai.hintEfficiency,
        total: score.ai.total,
        neutral: score.ai.neutral,
        max: POINTS.aiEfficiency,
        parts: AI_POINTS,
        freeHintsPerQuestion: FREE_HINTS_PER_QUESTION,
        purposefulRuns: PURPOSEFUL_RUNS,
      },
    },
    stageResults,
    questionResults,
    skillsVerification,
    aiUsage,
    recommendations: [] as string[],
  };
  report.recommendations = recommendations(report);
  return report;
}

/** Deterministic, rule-based next steps from the results. */
export function recommendations(report: {
  stageResults: { label: string; percent: number }[];
  questionResults: QuestionResult[];
  skillsVerification: SkillResult[];
  scoreBreakdown: { performance: { executionReliability: number }; aiEfficiency: { neutral: boolean; testingBehavior: number } };
}) {
  const tips: string[] = [];
  const weakest = [...report.stageResults].sort((a, b) => a.percent - b.percent)[0];
  if (weakest && weakest.percent < 70) {
    tips.push(`Focus your practice on ${weakest.label}-level problems, where you scored ${Math.round(weakest.percent)}%.`);
  }
  const skipped = report.questionResults.filter((q) => q.status === "not_attempted").length;
  if (skipped) tips.push(`Leave a little time for every question: ${skipped} went unanswered, and partial answers earn credit.`);
  const failedBuilds = report.questionResults.filter((q) => q.tests && OUTCOME_FEEDBACK[q.tests.outcome]).length;
  if (failedBuilds) tips.push("Run your code before submitting: at least one submission didn't compile or run to completion.");
  const weakCoding = report.questionResults.filter((q) => q.kind === "practical" && q.status === "completed" && q.correctnessPercent < 60);
  if (weakCoding.length) tips.push("Test edge cases (empty input, boundaries, invalid values) before submitting; hidden tests check them.");
  const missing = report.questionResults.flatMap((q) => q.missingConcepts).slice(0, 3);
  if (missing.length) tips.push(`Review these concepts from your written answers: ${missing.join("; ")}.`);
  const weakSkills = report.skillsVerification.filter((s) => s.claimed && s.status === "not_demonstrated").map((s) => s.skill);
  if (weakSkills.length) tips.push(`Strengthen the evidence for ${weakSkills.slice(0, 3).join(", ")}, which you list but didn't demonstrate here.`);
  if (!report.scoreBreakdown.aiEfficiency.neutral && report.scoreBreakdown.aiEfficiency.testingBehavior < AI_POINTS.testingBehavior * 0.8) {
    tips.push("Make each run count: change one thing, run, and read the failing test before changing more.");
  }
  if (!tips.length) tips.push("Strong, consistent work. Try a fresh assessment after adding new projects to your résumé.");
  return tips.slice(0, 6);
}

export function classificationLabel(value: Classification) {
  return CLASSIFICATIONS.find((range) => range.value === value)?.label ?? value;
}
