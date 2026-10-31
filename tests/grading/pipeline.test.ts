import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionReport } from "@/lib/execution/execute";
import type { RawWrittenEvaluation } from "@/lib/grading/written";

// The grading pipeline's control flow with storage, the sandbox and the
// model stubbed: what gets graded, what's reused, what's stored, and how
// failures are recorded. The database rules (claiming, fencing) are tested
// in tests/database/grading.test.ts.

const USER = "11111111-1111-4111-8111-111111111111";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  rpc: (() => {}) as (name: string, args: Row) => unknown,
  rpcCalls: [] as { name: string; args: Row }[],
  upserts: [] as { table: string; row: Row }[],
}));
const mocks = vi.hoisted(() => ({ executeTests: vi.fn(), recordExecution: vi.fn(), loadQuestionSecrets: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      let rows = [...(db.tables[table] ?? [])];
      let single = false;
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        in: () => builder,
        lt: () => builder,
        not: () => builder,
        returns: () => builder,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => !(column in row) || row[column] === value);
          return builder;
        },
        single: () => ((single = true), builder),
        maybeSingle: () => ((single = true), builder),
        upsert: async (row: Row) => {
          db.upserts.push({ table, row });
          return { error: null };
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: single ? (rows[0] ?? null) : rows, error: null }),
      };
      return builder;
    },
    async rpc(name: string, args: Row) {
      db.rpcCalls.push({ name, args });
      return { data: db.rpc(name, args), error: null };
    },
  }),
}));
vi.mock("@/lib/assessment/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assessment/session")>()),
  loadQuestionSecrets: mocks.loadQuestionSecrets,
  recordExecution: mocks.recordExecution,
}));
vi.mock("@/lib/execution/execute", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/execution/execute")>()),
  executeTests: mocks.executeTests,
}));

const { gradeAssessment } = await import("@/lib/grading/pipeline");
const { ExecutionUnavailableError } = await import("@/lib/execution/execute");

const STARTER = "function solve() { throw new Error('Not implemented') }";
const rubric = { kind: "written", criteria: [{ name: "Correctness", description: "Right", points: 10 }], keyPoints: [], redFlags: [], modelAnswer: "SECRET MODEL ANSWER" };

function question(id: string, tier: string, kind: "practical" | "written", order: number) {
  return {
    id,
    assessment_id: ID,
    tier,
    difficulty: "easy",
    kind,
    question_type: kind === "practical" ? "coding" : "theory",
    title: `Q ${id}`,
    description: "Statement",
    skills_tested: ["TypeScript"],
    language: kind === "practical" ? "typescript" : null,
    entry_point: kind === "practical" ? "solve" : null,
    starter_files: kind === "practical" ? [{ path: "solution.ts", content: STARTER }] : [],
    display_order: order,
  };
}

const report = (passed: number, total: number): ExecutionReport => ({
  runtime: "quickjs-wasm",
  outcome: passed === total ? "passed" : "failed",
  tests: [],
  passed,
  total,
  executionTimeMs: 4,
  logs: [],
  error: null,
});

const evaluation = (score: number): RawWrittenEvaluation => ({
  questionId: "w1",
  score,
  maxScore: 10,
  criteria: [{ name: "Correctness", score, justification: "ok" }],
  strengths: [],
  missingConcepts: [],
  explanation: "Fine.",
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.rpcCalls = [];
  db.upserts = [];
  db.tables = {
    assessments: [{ id: ID, user_id: USER, status: "completed", started_at: "2026-10-31T10:00:00Z", completed_at: "2026-10-31T10:40:00Z", resume_id: null }],
    assessment_questions: [
      question("p1", "novice", "practical", 0), // attempted, not yet graded
      question("p2", "adept", "practical", 1), // starter left unchanged
      question("w1", "adept", "written", 2), // answered
      question("w2", "master", "written", 3), // empty
    ],
    assessment_answers: [
      { question_id: "p1", answer_text: null, code: "function solve() { return 1 }" },
      { question_id: "p2", answer_text: null, code: STARTER },
      { question_id: "w1", answer_text: "Indexes speed up reads at the cost of writes.", code: null },
      { question_id: "w2", answer_text: "   ", code: null },
    ],
    assessment_stages: ["novice", "adept", "master"].map((tier) => ({ tier, status: "submitted", started_at: null, submitted_at: null })),
    code_executions: [],
    ai_interactions: [],
    written_evaluations: [],
  };
  db.rpc = (name) => (name === "claim_assessment_grading" ? { result: "claimed", attempt: 3 } : true);
  mocks.loadQuestionSecrets.mockResolvedValue({ tests: [{ name: "h", args: [1], expected: 1, expectThrows: false, hidden: true }], rubric, referenceCode: [], modelAnswer: null, keyPoints: [] });
  mocks.executeTests.mockResolvedValue(report(8, 10));
  mocks.recordExecution.mockImplementation(async (_u: string, _a: string, questionId: string, type: string, _code: string, r: ExecutionReport) => {
    db.tables.code_executions.push({
      id: "e1",
      question_id: questionId,
      execution_type: type,
      outcome: r.outcome,
      passed_tests: r.passed,
      total_tests: r.total,
      execution_time_ms: 4,
      code_sha256: "0".repeat(64),
      results: { hidden: { passed: 6, total: 8 } },
      created_at: "2026-10-31T10:41:00Z",
    });
    return "recorded";
  });
});

const rpc = (name: string) => db.rpcCalls.find((call) => call.name === name);

describe("gradeAssessment", () => {
  it("does nothing when another worker holds the claim, or it's already graded", async () => {
    for (const result of ["in_progress", "completed", "not_finished"]) {
      db.rpc = () => ({ result });
      expect(await gradeAssessment(USER, ID)).toBe(result);
    }
    expect(mocks.executeTests).not.toHaveBeenCalled();
  });

  it("grades code with tests, written answers with the rubric, and stores one report for this attempt", async () => {
    const call = vi.fn().mockResolvedValue({ data: evaluation(7), model: "grader" });
    expect(await gradeAssessment(USER, ID, { structuredCall: call })).toBe("completed");

    // Only the attempted, ungraded coding answer runs; the untouched starter doesn't.
    expect(mocks.executeTests).toHaveBeenCalledTimes(1);
    expect(mocks.recordExecution).toHaveBeenCalledWith(USER, ID, "p1", "auto_submit", "function solve() { return 1 }", expect.anything());
    // Only the non-empty written answer goes to the model.
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0].user).toContain("Indexes speed up reads");

    const saved = db.upserts.find((u) => u.table === "written_evaluations")!.row;
    expect(saved).toMatchObject({ question_id: "w1", score: 7, max_score: 10, answer_sha256: createHash("sha256").update("Indexes speed up reads at the cost of writes.").digest("hex") });

    const completed = rpc("complete_assessment_grading")!.args;
    expect(completed.p_attempt).toBe(3);
    const stored = completed.p_report as { correctnessScore: number; questionResults: { questionId: string; status: string; correctnessPercent: number }[] };
    expect(stored.questionResults.map((q) => [q.questionId, q.status, q.correctnessPercent])).toEqual([
      ["p1", "completed", 80],
      ["p2", "not_attempted", 0],
      ["w1", "completed", 70],
      ["w2", "not_attempted", 0],
    ]);
    expect(stored.correctnessScore).toBe(26.25);
    // The rubric's model answer is audit-only; it never reaches the report.
    expect(JSON.stringify(stored)).not.toContain("SECRET MODEL ANSWER");
  });

  it("reuses a stored evaluation of the same answer instead of asking the model again", async () => {
    const answer = "Indexes speed up reads at the cost of writes.";
    db.tables.written_evaluations.push({
      question_id: "w1",
      assessment_id: ID,
      answer_sha256: createHash("sha256").update(answer).digest("hex"),
      evaluation: { questionId: "w1", score: 9, maxScore: 10, criteria: [], strengths: [], missingConcepts: [], explanation: "" },
    });
    const call = vi.fn();
    expect(await gradeAssessment(USER, ID, { structuredCall: call })).toBe("completed");
    expect(call).not.toHaveBeenCalled();
  });

  it("records a failure for the claimed attempt and stores no report", async () => {
    mocks.executeTests.mockRejectedValue(new ExecutionUnavailableError("no sandbox"));
    expect(await gradeAssessment(USER, ID, { structuredCall: vi.fn() })).toBe("failed");
    expect(rpc("complete_assessment_grading")).toBeUndefined();
    expect(rpc("fail_assessment_grading")!.args).toMatchObject({ p_attempt: 3, p_reason: expect.stringMatching(/Code execution is unavailable/) });
  });

  it("reports in_progress if a newer attempt took over before saving", async () => {
    db.rpc = (name) => (name === "claim_assessment_grading" ? { result: "claimed", attempt: 1 } : false);
    expect(await gradeAssessment(USER, ID, { structuredCall: vi.fn().mockResolvedValue({ data: evaluation(5), model: "m" }) })).toBe("in_progress");
  });

  it("passes retry through to the claim", async () => {
    db.rpc = () => ({ result: "failed" });
    await gradeAssessment(USER, ID, { retry: true });
    expect(rpc("claim_assessment_grading")!.args).toMatchObject({ p_retry: true });
  });
});
