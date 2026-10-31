import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { typescriptProfile } from "../fixtures/profiles";

// Route handlers with authentication and storage mocked out: these check the
// request handling (auth, origin, ownership, duplicate requests, start rules).
// The database rules behind the mocks are tested in tests/database.

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  after: vi.fn(),
  getOwnedResume: vi.fn(),
  getLatestAnalyzedResume: vi.fn(),
  expireStaleGenerations: vi.fn(),
  findActiveAssessment: vi.fn(),
  countRecentGenerations: vi.fn(),
  createGeneratingAssessment: vi.fn(),
  getAssessment: vi.fn(),
  startAssessment: vi.fn(),
  runAssessmentGeneration: vi.fn(),
  toPublicAssessment: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/auth", () => ({ getVerifiedUserId: async () => mocks.userId }));
vi.mock("@/lib/resumes/store", () => ({
  getOwnedResume: mocks.getOwnedResume,
  getLatestAnalyzedResume: mocks.getLatestAnalyzedResume,
}));
vi.mock("@/lib/assessment/store", () => ({
  GENERATIONS_PER_DAY: 5,
  expireStaleGenerations: mocks.expireStaleGenerations,
  findActiveAssessment: mocks.findActiveAssessment,
  countRecentGenerations: mocks.countRecentGenerations,
  createGeneratingAssessment: mocks.createGeneratingAssessment,
  getAssessment: mocks.getAssessment,
  startAssessment: mocks.startAssessment,
}));
vi.mock("@/lib/assessment/run", () => ({ runAssessmentGeneration: mocks.runAssessmentGeneration }));
vi.mock("@/lib/assessment/public", () => ({ toPublicAssessment: mocks.toPublicAssessment }));

const { POST: generate } = await import("@/app/api/assessments/route");
const { GET: getOne } = await import("@/app/api/assessments/[id]/route");
const { POST: start } = await import("@/app/api/assessments/[id]/start/route");

const USER = "11111111-1111-4111-8111-111111111111";
const RESUME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSESSMENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const analysis = {
  version: 1,
  analyzedAt: "2026-10-31T00:00:00.000Z",
  model: "test",
  validation: { isResume: true, isTechnicalResume: true, hasSufficientInformation: true, reason: "ok" },
  profile: typescriptProfile,
};

const analyzedResume = { id: RESUME, filename: "ada.pdf", status: "analyzed", analysis };

function request(url: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  const method = init.method ?? "POST";
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(method !== "GET" ? { origin: init.origin ?? "http://localhost:3000" } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = USER;
  mocks.getOwnedResume.mockResolvedValue(analyzedResume);
  mocks.getLatestAnalyzedResume.mockResolvedValue(analyzedResume);
  mocks.findActiveAssessment.mockResolvedValue(null);
  mocks.countRecentGenerations.mockResolvedValue(0);
  mocks.createGeneratingAssessment.mockResolvedValue({
    assessment: { id: ASSESSMENT, status: "generating" },
    created: true,
  });
  mocks.toPublicAssessment.mockImplementation(async (row: { id: string; status: string }) => ({
    id: row.id,
    status: row.status,
  }));
});

describe("POST /api/assessments", () => {
  it("requires a session", async () => {
    mocks.userId = null;
    const response = await generate(request("/api/assessments", { body: { resumeId: RESUME } }));
    expect(response.status).toBe(401);
    expect(mocks.createGeneratingAssessment).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests", async () => {
    const response = await generate(request("/api/assessments", { body: {}, origin: "https://evil.example" }));
    expect(response.status).toBe(403);
  });

  it("rejects malformed ids", async () => {
    const response = await generate(request("/api/assessments", { body: { resumeId: "../etc" } }));
    expect(response.status).toBe(400);
  });

  it("returns 404 for a résumé the user doesn't own", async () => {
    mocks.getOwnedResume.mockResolvedValue(null);
    const response = await generate(request("/api/assessments", { body: { resumeId: RESUME } }));
    expect(response.status).toBe(404);
    expect(mocks.getOwnedResume).toHaveBeenCalledWith(USER, RESUME);
  });

  it("refuses résumés that haven't passed analysis (invalid PDFs never get here)", async () => {
    mocks.getOwnedResume.mockResolvedValue({ ...analyzedResume, status: "failed", analysis: null });
    const response = await generate(request("/api/assessments", { body: { resumeId: RESUME } }));
    expect(response.status).toBe(409);
    expect(mocks.createGeneratingAssessment).not.toHaveBeenCalled();
  });

  it("creates a generating assessment and generates in the background", async () => {
    const response = await generate(request("/api/assessments", { body: { resumeId: RESUME } }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ assessmentId: ASSESSMENT, status: "generating", reused: false });
    expect(mocks.createGeneratingAssessment).toHaveBeenCalledWith(USER, {
      id: RESUME,
      filename: "ada.pdf",
      domain: typescriptProfile.primaryDomain,
    });
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("returns the existing assessment instead of starting a duplicate", async () => {
    mocks.findActiveAssessment.mockResolvedValue({ id: ASSESSMENT, status: "generating" });
    const response = await generate(request("/api/assessments", { body: { resumeId: RESUME } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ assessmentId: ASSESSMENT, reused: true });
    expect(mocks.createGeneratingAssessment).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("doesn't start a second generation when a concurrent request won the insert", async () => {
    mocks.createGeneratingAssessment.mockResolvedValue({
      assessment: { id: ASSESSMENT, status: "generating" },
      created: false,
    });
    const response = await generate(request("/api/assessments", { body: { resumeId: RESUME } }));
    expect(response.status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rate-limits generations per day", async () => {
    mocks.countRecentGenerations.mockResolvedValue(5);
    const response = await generate(request("/api/assessments", { body: { resumeId: RESUME } }));
    expect(response.status).toBe(429);
  });
});

describe("GET /api/assessments/:id", () => {
  it("returns 404 for someone else's assessment", async () => {
    mocks.getAssessment.mockResolvedValue(null);
    const response = await getOne(request(`/api/assessments/${ASSESSMENT}`, { method: "GET" }), params(ASSESSMENT));
    expect(response.status).toBe(404);
    expect(mocks.getAssessment).toHaveBeenCalledWith(USER, ASSESSMENT);
  });

  it("returns the candidate view and the server time", async () => {
    mocks.getAssessment.mockResolvedValue({ id: ASSESSMENT, status: "ready" });
    const response = await getOne(request(`/api/assessments/${ASSESSMENT}`, { method: "GET" }), params(ASSESSMENT));
    const body = await response.json();
    expect(body.assessment).toEqual({ id: ASSESSMENT, status: "ready" });
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("POST /api/assessments/:id/start", () => {
  it("requires a session", async () => {
    mocks.userId = null;
    const response = await start(request(`/api/assessments/${ASSESSMENT}/start`), params(ASSESSMENT));
    expect(response.status).toBe(401);
    expect(mocks.startAssessment).not.toHaveBeenCalled();
  });

  it("returns 404 when it isn't the user's", async () => {
    mocks.startAssessment.mockResolvedValue(null);
    const response = await start(request(`/api/assessments/${ASSESSMENT}/start`), params(ASSESSMENT));
    expect(response.status).toBe(404);
    expect(mocks.startAssessment).toHaveBeenCalledWith(USER, ASSESSMENT);
  });

  it("starts a ready assessment", async () => {
    mocks.startAssessment.mockResolvedValue({ id: ASSESSMENT, status: "in_progress" });
    const response = await start(request(`/api/assessments/${ASSESSMENT}/start`), params(ASSESSMENT));
    expect(response.status).toBe(200);
  });

  it.each(["generating", "failed", "expired"])("refuses to start a %s assessment", async (status) => {
    mocks.startAssessment.mockResolvedValue({ id: ASSESSMENT, status });
    const response = await start(request(`/api/assessments/${ASSESSMENT}/start`), params(ASSESSMENT));
    expect(response.status).toBe(409);
  });
});
