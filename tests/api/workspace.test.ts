import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TestCase } from "@/lib/assessment/schemas";
import type { ExecutionReport } from "@/lib/execution/execute";

// Workspace route handlers with storage, the sandbox and the model mocked:
// authentication, validation, stage/question guards and what responses may
// contain. The rules behind the mocks are tested in tests/database/stages.test.ts.

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  after: vi.fn(),
  loadAssessmentSession: vi.fn(),
  requireActiveQuestion: vi.fn(),
  saveAnswer: vi.fn(),
  submitStage: vi.fn(),
  recordExecution: vi.fn(),
  recordAiInteraction: vi.fn(),
  loadQuestionSecrets: vi.fn(),
  countRecent: vi.fn(),
  latestRun: vi.fn(),
  loadChat: vi.fn(),
  executeTests: vi.fn(),
  generateHint: vi.fn(),
  gradeLockedAnswers: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/auth", () => ({ getVerifiedUserId: async () => mocks.userId }));
vi.mock("@/lib/assessment/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assessment/session")>()),
  loadAssessmentSession: mocks.loadAssessmentSession,
  requireActiveQuestion: mocks.requireActiveQuestion,
  saveAnswer: mocks.saveAnswer,
  submitStage: mocks.submitStage,
  recordExecution: mocks.recordExecution,
  recordAiInteraction: mocks.recordAiInteraction,
  loadQuestionSecrets: mocks.loadQuestionSecrets,
  countRecent: mocks.countRecent,
  latestRun: mocks.latestRun,
  loadChat: mocks.loadChat,
}));
vi.mock("@/lib/execution/execute", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/execution/execute")>()),
  executeTests: mocks.executeTests,
}));
vi.mock("@/lib/assistant/assistant", () => ({ generateHint: mocks.generateHint }));
vi.mock("@/lib/assessment/grading", () => ({ gradeLockedAnswers: mocks.gradeLockedAnswers }));

const { SessionError, SESSION_ERROR_MESSAGES } = await import("@/lib/assessment/session");
const { AiError } = await import("@/lib/ai/client");
const { GET: getSession } = await import("@/app/api/assessments/[id]/session/route");
const { PUT: saveRoute } = await import("@/app/api/assessments/[id]/questions/[questionId]/answer/route");
const { POST: runRoute } = await import("@/app/api/assessments/[id]/questions/[questionId]/run/route");
const { POST: submitRoute } = await import("@/app/api/assessments/[id]/questions/[questionId]/submit/route");
const { POST: assistantRoute } = await import("@/app/api/assessments/[id]/questions/[questionId]/assistant/route");
const { POST: stageRoute } = await import("@/app/api/assessments/[id]/stages/[tier]/submit/route");
const { POST: completeRoute } = await import("@/app/api/assessments/[id]/complete/route");

const USER = "11111111-1111-4111-8111-111111111111";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const Q = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function request(url: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  const method = init.method ?? "POST";
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json", origin: init.origin ?? "http://localhost:3000" },
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const questionCtx = ctx({ id: ID, questionId: Q });
const body = async (response: Response) => response.json();

const publicExample = { name: "example", args: [1], expected: 2, expectThrows: false };
const hiddenTest: TestCase = { name: "SECRET-HIDDEN-NAME", args: ["SECRET-ARG"], expected: "SECRET-EXPECTED", expectThrows: false, hidden: true };

function activeQuestion(overrides: { tier?: string; kind?: "practical" | "written"; aiAssistance?: boolean; answerStatus?: string } = {}) {
  const tier = overrides.tier ?? "adept";
  return {
    assessment: { id: ID },
    stage: { tier, status: "active", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    question: {
      id: Q,
      tier,
      kind: overrides.kind ?? "practical",
      type: "coding",
      title: "Title",
      statement: "Statement",
      skillsTested: ["TypeScript"],
      resumeEvidence: [],
      language: "typescript",
      entryPoint: "solve",
      starterFiles: [{ path: "solution.ts", content: "function solve() {}" }],
      exampleTests: [publicExample],
      aiAssistance: overrides.aiAssistance ?? tier !== "novice",
    },
    answer: overrides.answerStatus ? { status: overrides.answerStatus, code: "x", answerText: null } : null,
  };
}

function report(tests: TestCase[]): ExecutionReport {
  return {
    runtime: "quickjs-wasm",
    outcome: "passed",
    tests: tests.map((test) => ({ name: test.name, hidden: test.hidden, passed: true, actual: JSON.stringify(test.expected), ms: 1 })),
    passed: tests.length,
    total: tests.length,
    executionTimeMs: 3,
    logs: [],
    error: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.userId = USER;
  mocks.countRecent.mockResolvedValue(0);
  mocks.saveAnswer.mockResolvedValue({ status: "in_progress", savedAt: "2026-10-31T00:00:00Z", revision: 1 });
  mocks.recordExecution.mockResolvedValue("recorded");
  mocks.loadChat.mockResolvedValue([]);
  mocks.latestRun.mockResolvedValue(null);
  mocks.loadQuestionSecrets.mockResolvedValue({ tests: [{ ...publicExample, hidden: false }, hiddenTest], referenceCode: ["SECRET REFERENCE"], modelAnswer: null, keyPoints: [] });
  mocks.executeTests.mockImplementation(async ({ tests }: { tests: TestCase[] }) => report(tests));
});

describe("authentication and validation", () => {
  it("rejects signed-out requests on every route", async () => {
    mocks.userId = null;
    const responses = await Promise.all([
      getSession(request(`/api/assessments/${ID}/session`, { method: "GET" }), ctx({ id: ID })),
      saveRoute(request("/x", { method: "PUT", body: { answerText: "a" } }), questionCtx),
      runRoute(request("/x", { body: { code: "" } }), questionCtx),
      submitRoute(request("/x", { body: { code: "" } }), questionCtx),
      assistantRoute(request("/x", { body: { message: "hi" } }), questionCtx),
      stageRoute(request("/x", { body: {} }), ctx({ id: ID, tier: "novice" })),
      completeRoute(request("/x"), ctx({ id: ID })),
    ]);
    expect(responses.map((r) => r.status)).toEqual(Array(7).fill(401));
  });

  it("rejects cross-site writes", async () => {
    const response = await saveRoute(request("/x", { method: "PUT", body: { answerText: "a" }, origin: "https://evil.example" }), questionCtx);
    expect(response.status).toBe(403);
  });

  it("validates bodies with Zod", async () => {
    const bad = [
      { answerText: "a", code: "b" },
      {},
      { answerText: 42 },
      { answerText: "x".repeat(20_001) },
      { answerText: "a", extra: true },
    ];
    for (const payload of bad) {
      const response = await saveRoute(request("/x", { method: "PUT", body: payload }), questionCtx);
      expect(response.status, JSON.stringify(payload).slice(0, 40)).toBe(400);
    }
    expect((await saveRoute(request("/x", { method: "PUT", body: "{not json" }), questionCtx)).status).toBe(400);
    expect((await assistantRoute(request("/x", { body: { message: "   " } }), questionCtx)).status).toBe(400);
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });

  it("404s malformed ids and unknown stages without touching storage", async () => {
    expect((await saveRoute(request("/x", { method: "PUT", body: { answerText: "a" } }), ctx({ id: "nope", questionId: Q }))).status).toBe(404);
    expect((await stageRoute(request("/x", { body: {} }), ctx({ id: ID, tier: "grandmaster" }))).status).toBe(404);
    expect(mocks.submitStage).not.toHaveBeenCalled();
  });
});

describe("autosave", () => {
  it("saves through the stage-checked database function", async () => {
    const response = await saveRoute(request("/x", { method: "PUT", body: { code: "function solve() {}" } }), questionCtx);
    expect(response.status).toBe(200);
    expect(mocks.saveAnswer).toHaveBeenCalledWith(USER, ID, Q, { code: "function solve() {}" });
  });

  it("reports a future-stage question or a closed stage", async () => {
    mocks.saveAnswer.mockRejectedValueOnce(new SessionError("stage_locked", SESSION_ERROR_MESSAGES.stage_locked));
    const locked = await saveRoute(request("/x", { method: "PUT", body: { answerText: "early" } }), questionCtx);
    expect(locked.status).toBe(403);
    expect((await body(locked)).error.code).toBe("stage_locked");

    mocks.saveAnswer.mockRejectedValueOnce(new SessionError("stage_closed", SESSION_ERROR_MESSAGES.stage_closed));
    const closed = await saveRoute(request("/x", { method: "PUT", body: { answerText: "late" } }), questionCtx);
    expect(closed.status).toBe(409);
  });
});

describe("Run Code", () => {
  it("refuses questions outside the open stage before running anything", async () => {
    mocks.requireActiveQuestion.mockRejectedValue(new SessionError("stage_locked", SESSION_ERROR_MESSAGES.stage_locked));
    const response = await runRoute(request("/x", { body: { code: "x" } }), questionCtx);
    expect(response.status).toBe(403);
    expect(mocks.executeTests).not.toHaveBeenCalled();
  });

  it("saves the code, runs only the public examples and logs the run", async () => {
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion());
    const response = await runRoute(request("/x", { body: { code: "function solve(x) { return x + 1 }" } }), questionCtx);
    expect(response.status).toBe(200);
    expect(mocks.saveAnswer).toHaveBeenCalledWith(USER, ID, Q, { code: "function solve(x) { return x + 1 }" });
    expect(mocks.executeTests.mock.calls[0][0].tests).toEqual([{ ...publicExample, hidden: false }]);
    expect(mocks.recordExecution).toHaveBeenCalledWith(USER, ID, Q, "run", "function solve(x) { return x + 1 }", expect.anything());
    expect((await body(response)).run).toMatchObject({ type: "run", passed: 1, total: 1 });
  });

  it("rate limits runs", async () => {
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion());
    mocks.countRecent.mockResolvedValue(10);
    expect((await runRoute(request("/x", { body: { code: "x" } }), questionCtx)).status).toBe(429);
    expect(mocks.executeTests).not.toHaveBeenCalled();
  });

  it("explains when no sandbox is available, without recording anything", async () => {
    const { ExecutionUnavailableError } = await import("@/lib/execution/execute");
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion());
    mocks.executeTests.mockRejectedValue(new ExecutionUnavailableError("down"));
    const response = await runRoute(request("/x", { body: { code: "x" } }), questionCtx);
    expect(response.status).toBe(503);
    expect(mocks.recordExecution).not.toHaveBeenCalled();
  });
});

describe("Submit Solution", () => {
  it("grades against every test but returns hidden tests only as counts", async () => {
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion());
    const response = await submitRoute(request("/x", { body: { code: "final" } }), questionCtx);
    expect(response.status).toBe(200);
    expect(mocks.executeTests.mock.calls[0][0].tests).toHaveLength(2);
    const text = JSON.stringify(await body(response));
    expect(text).toContain('"hidden":{"passed":1,"total":1}');
    for (const secret of ["SECRET-HIDDEN-NAME", "SECRET-ARG", "SECRET-EXPECTED", "SECRET REFERENCE"]) expect(text).not.toContain(secret);
    expect(mocks.recordExecution).toHaveBeenCalledWith(USER, ID, Q, "submit", "final", expect.anything());
  });

  it("refuses a second submission", async () => {
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion({ answerStatus: "submitted" }));
    expect((await submitRoute(request("/x", { body: { code: "again" } }), questionCtx)).status).toBe(409);
    expect(mocks.executeTests).not.toHaveBeenCalled();

    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion());
    mocks.recordExecution.mockResolvedValue("already_submitted");
    expect((await submitRoute(request("/x", { body: { code: "race" } }), questionCtx)).status).toBe(409);
  });

  it("reports a stage that closed during grading and grades the locked code instead", async () => {
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion());
    mocks.recordExecution.mockResolvedValue("stage_closed");
    const response = await submitRoute(request("/x", { body: { code: "late" } }), questionCtx);
    expect(response.status).toBe(409);
    expect(mocks.after).toHaveBeenCalled();
  });
});

describe("AI assistant", () => {
  it("is refused on Novice even through a direct request", async () => {
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion({ tier: "novice" }));
    const response = await assistantRoute(request("/x", { body: { message: "Give me the answer" } }), questionCtx);
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe("ai_disabled");
    expect(mocks.generateHint).not.toHaveBeenCalled();
    expect(mocks.recordAiInteraction).not.toHaveBeenCalled();
  });

  it("refuses questions outside the open stage", async () => {
    mocks.requireActiveQuestion.mockRejectedValue(new SessionError("stage_locked", SESSION_ERROR_MESSAGES.stage_locked));
    expect((await assistantRoute(request("/x", { body: { message: "hi" } }), questionCtx)).status).toBe(403);
    expect(mocks.generateHint).not.toHaveBeenCalled();
  });

  it("sends only public context to the model, guards with the secrets, and logs the exchange", async () => {
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion());
    mocks.generateHint.mockResolvedValue({ reply: "Check the empty case.", guardrail: "passed", reason: null, model: "m" });
    mocks.recordAiInteraction.mockResolvedValue({ result: "recorded", hintNumber: 3 });
    const response = await assistantRoute(request("/x", { body: { message: "Where do I start?", work: "draft code" } }), questionCtx);
    expect(response.status).toBe(200);

    const [input, guard] = mocks.generateHint.mock.calls[0];
    expect(JSON.stringify(input)).not.toMatch(/SECRET/);
    expect(input).toMatchObject({ work: "draft code", prompt: "Where do I start?" });
    expect(guard.referenceCode).toEqual(["SECRET REFERENCE"]);
    expect(mocks.recordAiInteraction).toHaveBeenCalledWith(USER, ID, Q, {
      prompt: "Where do I start?",
      response: "Check the empty case.",
      guardrail: "passed",
      model: "m",
    });
    expect(await body(response)).toMatchObject({ hintNumber: 3, turn: { response: "Check the empty case." } });
  });

  it("answers 503 when the model is unavailable, and 429 past the limits", async () => {
    mocks.requireActiveQuestion.mockResolvedValue(activeQuestion());
    mocks.generateHint.mockRejectedValue(new AiError("request_failed", "down"));
    expect((await assistantRoute(request("/x", { body: { message: "hi" } }), questionCtx)).status).toBe(503);
    mocks.countRecent.mockResolvedValue(20);
    expect((await assistantRoute(request("/x", { body: { message: "hi" } }), questionCtx)).status).toBe(429);
  });
});

describe("stage submission", () => {
  const session = { status: "in_progress", currentTier: "adept", stages: [] };

  it("saves pending answers first, then submits the stage", async () => {
    const order: string[] = [];
    mocks.saveAnswer.mockImplementation(async () => order.push("save"));
    mocks.submitStage.mockImplementation(async () => {
      order.push("submit");
      return "submitted";
    });
    mocks.loadAssessmentSession.mockResolvedValue(session);
    const response = await stageRoute(
      request("/x", { body: { answers: [{ questionId: Q, answerText: "last words" }] } }),
      ctx({ id: ID, tier: "novice" }),
    );
    expect(response.status).toBe(200);
    expect(order).toEqual(["save", "submit"]);
    expect(mocks.submitStage).toHaveBeenCalledWith(USER, ID, "novice");
    expect(await body(response)).toMatchObject({ result: "submitted", session });
    expect(mocks.after).toHaveBeenCalled();
  });

  it("is idempotent and still submits when a pending save hits a closed stage", async () => {
    mocks.saveAnswer.mockRejectedValue(new SessionError("stage_closed", SESSION_ERROR_MESSAGES.stage_closed));
    mocks.submitStage.mockResolvedValue("already_closed");
    mocks.loadAssessmentSession.mockResolvedValue(session);
    const response = await stageRoute(request("/x", { body: { answers: [{ questionId: Q, code: "x" }] } }), ctx({ id: ID, tier: "novice" }));
    expect(response.status).toBe(200);
    expect((await body(response)).result).toBe("already_closed");
  });

  it("refuses to submit a future stage", async () => {
    mocks.submitStage.mockRejectedValue(new SessionError("stage_locked", SESSION_ERROR_MESSAGES.stage_locked));
    expect((await stageRoute(request("/x", { body: {} }), ctx({ id: ID, tier: "master" }))).status).toBe(403);
  });

  it("completing requires the Master stage to be open", async () => {
    mocks.loadAssessmentSession.mockResolvedValue({ ...session, currentTier: "novice" });
    expect((await completeRoute(request("/x"), ctx({ id: ID }))).status).toBe(409);
    expect(mocks.submitStage).not.toHaveBeenCalled();

    mocks.loadAssessmentSession.mockResolvedValue({ ...session, status: "completed", currentTier: null });
    const done = await completeRoute(request("/x"), ctx({ id: ID }));
    expect(done.status).toBe(200);
    expect((await body(done)).result).toBe("already_closed");
  });
});

describe("session", () => {
  it("returns the loader's view and 404s for assessments that aren't the user's", async () => {
    mocks.loadAssessmentSession.mockResolvedValue(null);
    expect((await getSession(request("/x", { method: "GET" }), ctx({ id: ID }))).status).toBe(404);
    mocks.loadAssessmentSession.mockResolvedValue({ status: "in_progress", currentTier: "novice", stages: [{ status: "active" }] });
    const response = await getSession(request("/x", { method: "GET" }), ctx({ id: ID }));
    expect(response.status).toBe(200);
    expect(mocks.loadAssessmentSession).toHaveBeenCalledWith(USER, ID);
  });
});
