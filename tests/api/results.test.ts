import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Results and grading-retry routes: ownership, when grading is triggered,
// and that no score is returned before grading completes.

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  after: vi.fn(),
  getAssessment: vi.fn(),
  getResult: vi.fn(),
  gradeAssessment: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getVerifiedUserId: async () => mocks.userId }));
vi.mock("@/lib/assessment/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assessment/store")>()),
  getAssessment: mocks.getAssessment,
}));
vi.mock("@/lib/grading/results", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grading/results")>()),
  getResult: mocks.getResult,
}));
vi.mock("@/lib/grading/pipeline", () => ({ gradeAssessment: mocks.gradeAssessment }));

const { GET: results } = await import("@/app/api/assessments/[id]/results/route");
const { POST: grade } = await import("@/app/api/assessments/[id]/grade/route");

const USER = "11111111-1111-4111-8111-111111111111";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ctx = { params: Promise.resolve({ id: ID }) };
const get = () => results(new NextRequest(`http://localhost:3000/api/assessments/${ID}/results`), ctx);
const post = () =>
  grade(new NextRequest(`http://localhost:3000/api/assessments/${ID}/grade`, { method: "POST", headers: { origin: "http://localhost:3000" } }), ctx);

const stored = (status: string, extra: Record<string, unknown> = {}) => ({
  assessmentId: ID,
  status,
  failureReason: null,
  attempts: 1,
  stale: false,
  completedAt: null,
  report: null,
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.userId = USER;
  mocks.getAssessment.mockResolvedValue({ id: ID, status: "completed" });
});

describe("GET results", () => {
  it("requires sign-in and ownership", async () => {
    mocks.userId = null;
    expect((await get()).status).toBe(401);
    mocks.userId = USER;
    mocks.getAssessment.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(mocks.getAssessment).toHaveBeenCalledWith(USER, ID);
  });

  it("starts grading when it's waiting and returns no score before completion", async () => {
    mocks.getResult.mockResolvedValue(stored("pending"));
    const response = await get();
    expect(await response.json()).toEqual({ status: "pending", failureReason: null, report: null });
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("resumes a grading whose worker died, and leaves a live one alone", async () => {
    mocks.getResult.mockResolvedValue(stored("grading", { stale: true }));
    expect((await (await get()).json()).status).toBe("pending");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    mocks.after.mockClear();
    mocks.getResult.mockResolvedValue(stored("grading"));
    expect((await (await get()).json()).status).toBe("grading");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("doesn't retry a failure on its own", async () => {
    mocks.getResult.mockResolvedValue(stored("failed", { failureReason: "Sandbox down" }));
    expect(await (await get()).json()).toMatchObject({ status: "failed", failureReason: "Sandbox down" });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns the report once completed", async () => {
    mocks.getResult.mockResolvedValue(stored("completed", { report: { finalScore: 82 } }));
    expect(await (await get()).json()).toMatchObject({ status: "completed", report: { finalScore: 82 } });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("reports a running assessment as not finished", async () => {
    mocks.getAssessment.mockResolvedValue({ id: ID, status: "in_progress" });
    mocks.getResult.mockResolvedValue(null);
    expect((await (await get()).json()).status).toBe("not_finished");
  });
});

describe("POST grade (retry)", () => {
  it("retries a failed grading in the background", async () => {
    mocks.getResult.mockResolvedValue(stored("failed"));
    const response = await post();
    expect(response.status).toBe(202);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.gradeAssessment).toHaveBeenCalledWith(USER, ID, { retry: true });
  });

  it("refuses unfinished assessments and doesn't regrade completed ones", async () => {
    mocks.getAssessment.mockResolvedValue({ id: ID, status: "in_progress" });
    expect((await post()).status).toBe(409);
    mocks.getAssessment.mockResolvedValue({ id: ID, status: "expired" });
    mocks.getResult.mockResolvedValue(stored("completed"));
    expect(await (await post()).json()).toEqual({ status: "completed" });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
