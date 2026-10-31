import { beforeEach, describe, expect, it, vi } from "vitest";
import { typescriptProfile } from "../fixtures/profiles";

// The background runner (stages, failure handling) and the candidate-facing
// view (what is visible when), with generation and storage mocked.

const mocks = vi.hoisted(() => ({
  generateAssessment: vi.fn(),
  saveGeneratedQuestions: vi.fn(),
  markGenerationFailed: vi.fn(),
  setGenerationStage: vi.fn(),
  getAssessmentStructure: vi.fn(),
  tablesQueried: [] as string[],
  questionRows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/assessment/generate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assessment/generate")>()),
  generateAssessment: mocks.generateAssessment,
}));
vi.mock("@/lib/assessment/store", () => ({
  STALE_GENERATION_MS: 10 * 60 * 1000,
  saveGeneratedQuestions: mocks.saveGeneratedQuestions,
  markGenerationFailed: mocks.markGenerationFailed,
  setGenerationStage: mocks.setGenerationStage,
  getAssessmentStructure: mocks.getAssessmentStructure,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      mocks.tablesQueried.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        returns: async () => ({ data: mocks.questionRows, error: null }),
      };
      return query;
    },
  }),
}));

const { GenerationError } = await import("@/lib/assessment/generate");
const { runAssessmentGeneration } = await import("@/lib/assessment/run");
const { toPublicAssessment } = await import("@/lib/assessment/public");

const USER = "11111111-1111-4111-8111-111111111111";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.saveGeneratedQuestions.mockResolvedValue(undefined);
  mocks.markGenerationFailed.mockResolvedValue(undefined);
  mocks.setGenerationStage.mockResolvedValue(undefined);
  mocks.tablesQueried.length = 0;
  mocks.questionRows = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runAssessmentGeneration", () => {
  it("records stages in order, then saves", async () => {
    mocks.generateAssessment.mockImplementation(async (_profile, _deps, options) => {
      options.onStage("generating");
      options.onStage("validating");
      return { questions: [{ id: "q" }], model: "m", log: [] };
    });
    await runAssessmentGeneration(USER, ID, typescriptProfile);

    expect(mocks.setGenerationStage.mock.calls.map((call) => call[2])).toEqual(["generating", "validating", "preparing"]);
    expect(mocks.saveGeneratedQuestions).toHaveBeenCalledWith(USER, ID, [{ id: "q" }]);
    expect(mocks.markGenerationFailed).not.toHaveBeenCalled();
    // The last stage write finished before saving started.
    expect(mocks.setGenerationStage.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.saveGeneratedQuestions.mock.invocationCallOrder[0],
    );
  });

  it("marks the assessment failed with a candidate-facing reason, never ready", async () => {
    mocks.generateAssessment.mockRejectedValue(new GenerationError("generation_failed", "internal detail"));
    await runAssessmentGeneration(USER, ID, typescriptProfile);

    expect(mocks.saveGeneratedQuestions).not.toHaveBeenCalled();
    expect(mocks.markGenerationFailed).toHaveBeenCalledWith(USER, ID, expect.stringContaining("try again"));
    expect(mocks.markGenerationFailed.mock.calls[0][2]).not.toContain("internal detail");
  });

  it("treats a failed save as a failed generation", async () => {
    mocks.generateAssessment.mockResolvedValue({ questions: [], model: "m", log: [] });
    mocks.saveGeneratedQuestions.mockRejectedValue(new Error("an assessment needs 12 questions"));
    await runAssessmentGeneration(USER, ID, typescriptProfile);
    expect(mocks.markGenerationFailed).toHaveBeenCalledTimes(1);
  });

  it("keeps going when a stage update can't be written", async () => {
    mocks.setGenerationStage.mockRejectedValue(new Error("network"));
    mocks.generateAssessment.mockImplementation(async (_profile, _deps, options) => {
      options.onStage("generating");
      return { questions: [], model: "m", log: [] };
    });
    await runAssessmentGeneration(USER, ID, typescriptProfile);
    expect(mocks.saveGeneratedQuestions).toHaveBeenCalledTimes(1);
  });

  it("explains unsupported résumés", async () => {
    mocks.generateAssessment.mockRejectedValue(new GenerationError("unsupported_languages", "x"));
    await runAssessmentGeneration(USER, ID, typescriptProfile);
    expect(mocks.markGenerationFailed.mock.calls[0][2]).toMatch(/JavaScript, TypeScript or Python/);
  });
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    user_id: USER,
    resume_id: null,
    status: "ready",
    duration_minutes: 30,
    started_at: null,
    expires_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    failure_reason: null,
    generation_stage: null,
    resume_filename: "cv.pdf",
    technical_domain: "Backend development",
    ...overrides,
  } as Parameters<typeof toPublicAssessment>[0];
}

// Stored per-question minutes from an older 8 / 10 / 12 schedule; stages
// still run for their fixed 15 / 20 / 25 minutes.
const MINUTES = { novice: [2, 2, 2, 2], adept: [2, 2, 3, 3], master: [3, 3, 3, 3] };
const outline = (["novice", "adept", "master"] as const).flatMap((tier, t) =>
  MINUTES[tier].map((minutes, i) => ({
    tier,
    kind: i === 3 ? "practical" : "written",
    question_type: i === 3 ? "coding" : "theory",
    language: i === 3 ? "typescript" : null,
    time_allocation_minutes: minutes,
    ai_assistance: t > 0,
    display_order: t * 4 + i,
  })),
);

describe("toPublicAssessment", () => {
  it("shows only the outline before the start, never question content or secrets", async () => {
    mocks.getAssessmentStructure.mockResolvedValue(outline);
    const view = await toPublicAssessment(row());

    expect(view.contentVisible).toBe(false);
    expect(view.questionCount).toBe(12);
    expect(view.tiers.map((tier) => [tier.label, tier.questions.length, tier.minutes])).toEqual([
      ["Novice", 4, 15],
      ["Adept", 4, 20],
      ["Master", 4, 25],
    ]);
    expect(view.durationMinutes).toBe(60);
    const serialized = JSON.stringify(view);
    for (const field of ["title", "statement", "starterFiles", "exampleTests", "reference", "hidden"]) {
      expect(serialized).not.toContain(field);
    }
    expect(mocks.tablesQueried).toEqual([]);
  });

  it("reads started questions through the candidate's session, never the secrets table", async () => {
    mocks.questionRows = [];
    const started = new Date().toISOString();
    const view = await toPublicAssessment(
      row({ status: "in_progress", started_at: started, expires_at: new Date(Date.now() + 60_000).toISOString() }),
    );
    expect(view.contentVisible).toBe(true);
    expect(mocks.tablesQueried).toEqual(["assessment_questions"]);
  });

  it("reports an in-progress assessment past its deadline as expired", async () => {
    const view = await toPublicAssessment(
      row({
        status: "in_progress",
        started_at: new Date(Date.now() - 31 * 60_000).toISOString(),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    expect(view.status).toBe("expired");
  });

  it("reports a generation stuck past the limit as failed", async () => {
    const view = await toPublicAssessment(
      row({ status: "generating", generation_stage: "validating", created_at: new Date(Date.now() - 11 * 60_000).toISOString() }),
    );
    expect(view.status).toBe("failed");
    expect(view.generationStage).toBeNull();
    expect(view.failureReason).toMatch(/too long/);
  });

  it("exposes the generation stage while generating", async () => {
    const view = await toPublicAssessment(row({ status: "generating", generation_stage: "validating" }));
    expect(view.generationStage).toBe("validating");
  });
});
