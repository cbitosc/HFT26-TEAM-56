import { describe, expect, it } from "vitest";
import { AiError } from "@/lib/ai/client";
import { ASSESSMENT_MINUTES, TIER_CONFIG, TIERS } from "@/lib/assessment/config";
import { GenerationError, generateAssessment, type GenerationDeps } from "@/lib/assessment/generate";
import type { GeneratedQuestion } from "@/lib/assessment/schemas";
import { VALID_TIERS, fakeModel, practical, written } from "../fixtures/fake-model";
import { javaOnlyProfile, pythonOnlyProfile, typescriptProfile } from "../fixtures/profiles";

const sandboxUp = { sandboxAvailable: async () => true };

const PYTHON_TITLES: Record<string, string[]> = {
  novice: ["FastAPI dependency injection", "Python generators explained", "PostgreSQL transactions basics"],
  adept: ["Pydantic validation errors", "Slow Pathfinder planning endpoint"],
  master: ["Scaling Pathfinder planning", "Reconciling route assignments"],
};

function expectStructure(questions: GeneratedQuestion[]) {
  expect(questions).toHaveLength(12);
  for (const tier of TIERS) {
    const config = TIER_CONFIG[tier];
    const inTier = questions.filter((question) => question.tier === tier);
    expect(inTier).toHaveLength(4);
    expect(inTier.every((question) => question.difficulty === config.difficulty)).toBe(true);
    expect(inTier.reduce((sum, question) => sum + question.timeMinutes, 0)).toBe(config.minutes);
    expect(inTier.filter((question) => question.kind === "practical")).toHaveLength(config.practical);
    for (const [type, count] of Object.entries(config.written)) {
      expect(inTier.filter((question) => question.kind === "written" && question.type === type)).toHaveLength(count!);
    }
  }
  expect(questions.reduce((sum, question) => sum + question.timeMinutes, 0)).toBe(ASSESSMENT_MINUTES);
}

describe("generateAssessment", () => {
  it("produces a validated 12-question assessment with the exact tier structure", async () => {
    const { ai, calls } = fakeModel((tier) => VALID_TIERS[tier]());
    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp });

    expectStructure(result.questions);
    expect(calls).toHaveLength(3);
    for (const question of result.questions) {
      expect(question.resumeEvidence.length).toBeGreaterThan(0);
      expect(question.skillsTested.length).toBeGreaterThan(0);
      if (question.kind === "practical") {
        expect(question.source).toBe("ai");
        expect(question.validation.method).toBe("sandbox");
        if (question.validation.method === "sandbox") {
          expect(question.validation.reference.passed).toBe(question.validation.reference.total);
          expect(question.validation.starter.passed).toBeLessThan(question.validation.starter.total);
        }
      }
    }
  });

  it("retries a tier with precise feedback when the reference disagrees with many tests", async () => {
    const { ai, calls } = fakeModel((tier, attempt) => {
      if (tier === "adept" && attempt === 1) {
        const broken = practical("paginate");
        const tests = (broken.tests as { name: string; expectedJson: string }[]).map((test, index) =>
          index < 3 ? { ...test, expectedJson: '{"items":[999]}' } : test,
        );
        return [...VALID_TIERS.adept().slice(0, 2), { ...broken, tests }, practical("parse-query")];
      }
      return VALID_TIERS[tier]();
    });

    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    expectStructure(result.questions);
    const adeptCalls = calls.filter((call) => call.tier === "adept");
    expect(adeptCalls).toHaveLength(2);
    expect(adeptCalls[1].user).toMatch(/referenceCode fails tests "first page"/);
  });

  it("drops a single disputed or malformed test instead of discarding the question", async () => {
    const { ai, calls } = fakeModel((tier) => {
      if (tier === "adept") {
        const question = practical("paginate");
        const tests = (question.tests as { name: string; argsJson: string; expectedJson: string }[]).map((test, index) =>
          index === 2 ? { ...test, expectedJson: '{"items":[999]}' } : index === 3 ? { ...test, argsJson: "[1, 2," } : test,
        );
        return [...VALID_TIERS.adept().slice(0, 2), { ...question, tests }, practical("parse-query")];
      }
      return VALID_TIERS[tier]();
    });

    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    expect(calls.filter((call) => call.tier === "adept")).toHaveLength(1);
    const paginate = result.questions.find((question) => question.kind === "practical" && question.entryFunction === "paginate");
    expect(paginate?.kind === "practical" && paginate.tests.length).toBe(5);
    expect(paginate?.kind === "practical" && paginate.validation.method === "sandbox" && paginate.validation.droppedTests).toBe(2);
  });

  it("replaces only the question that repeats an earlier tier", async () => {
    const { ai, calls } = fakeModel((tier, attempt) => {
      if (tier === "master" && attempt === 1) {
        // Same title as Adept's situational question.
        return [written("architecture", "Slow paginated endpoint in Orders API"), ...VALID_TIERS.master().slice(1)];
      }
      return VALID_TIERS[tier]();
    });

    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    expectStructure(result.questions);
    const masterCalls = calls.filter((call) => call.tier === "master");
    expect(masterCalls).toHaveLength(2);
    expect(masterCalls[1].user).toMatch(/Avoid \(already used\):[\s\S]*Slow paginated endpoint in Orders API/);
    const master = result.questions.filter((question) => question.tier === "master");
    expect(master.map((question) => question.title)).toContain("Scaling RateKeeper across regions");
    expect(master.filter((question) => question.kind === "practical")).toHaveLength(2);
  });

  it("rejects questions about technologies the candidate never claimed", async () => {
    const { ai, calls } = fakeModel((tier, attempt) => {
      if (tier === "master" && attempt === 1) {
        return [
          written("architecture", "Deploying RateKeeper on Kubernetes", {
            statement: "Design how RateKeeper would run on Kubernetes with autoscaling across three regions, handling failover and consistent limits.",
          }),
          ...VALID_TIERS.master().slice(1),
        ];
      }
      return VALID_TIERS[tier]();
    });

    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    expect(result.questions.some((question) => /kubernetes/i.test(question.statement))).toBe(false);
    expect(calls.filter((call) => call.tier === "master")[1].user).toMatch(/Mentions Kubernetes/);
  });

  it("rejects DSA topics the résumé doesn't mention", async () => {
    const { ai, calls } = fakeModel((tier, attempt) => {
      if (tier === "novice" && attempt === 1) {
        return [
          written("theory", "Balancing a binary search tree", {
            statement: "Explain how you would keep a binary search tree balanced as orders are inserted into the Orders API in TypeScript.",
          }),
          ...VALID_TIERS.novice().slice(1),
        ];
      }
      return VALID_TIERS[tier]();
    });

    await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    expect(calls.filter((call) => call.tier === "novice")[1].user).toMatch(/DSA topic the résumé doesn't mention/);
  });

  it("rejects skills and evidence that aren't grounded in the profile", async () => {
    const { ai, calls } = fakeModel((tier, attempt) => {
      if (tier === "novice" && attempt === 1) {
        return [
          written("theory", "Kotlin coroutines", {
            skillsTested: ["Kotlin"],
            resumeEvidence: ["General programming background"],
          }),
          ...VALID_TIERS.novice().slice(1),
        ];
      }
      return VALID_TIERS[tier]();
    });

    await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    const feedback = calls.filter((call) => call.tier === "novice")[1].user;
    expect(feedback).toMatch(/None of skillsTested \(Kotlin\) is claimed/);
    expect(feedback).toMatch(/Mentions Kotlin/);
    expect(feedback).toMatch(/doesn't cite a specific project/);
  });

  it("keeps valid questions across attempts and only asks again for missing slots", async () => {
    // Attempt 1: written fine, practical starter passes everything. Attempt 2: practical fixed.
    const { ai, calls } = fakeModel((tier, attempt) => {
      if (tier === "novice" && attempt === 1) {
        const stub = practical("summarize-totals");
        return [...VALID_TIERS.novice().slice(0, 3), { ...stub, starterCode: stub.referenceCode + "\n// done" }];
      }
      return VALID_TIERS[tier]();
    });
    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    expectStructure(result.questions);
    expect(calls.filter((call) => call.tier === "novice")[1].user).toMatch(/starterCode passes every test/);
  });

  it("falls back to prevalidated templates when practical questions never validate", async () => {
    const { ai } = fakeModel((tier) =>
      VALID_TIERS[tier]().map((question) =>
        question.kind === "practical" ? { ...question, referenceCode: question.starterCode } : question,
      ),
    );
    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp }, { maxAttempts: 2 });

    expectStructure(result.questions);
    const practicalQuestions = result.questions.filter((question) => question.kind === "practical");
    expect(practicalQuestions.every((question) => question.source === "template")).toBe(true);
    expect(practicalQuestions.every((question) => question.language === "typescript")).toBe(true);
    expect(result.log.join(" ")).toMatch(/prevalidated templates/);
  });

  it("uses Python templates and asks the model only for written questions when no sandbox language is claimed", async () => {
    const { ai, calls } = fakeModel((tier) =>
      VALID_TIERS[tier]()
        .filter((question) => question.kind === "written")
        .map((question, index) => ({
          ...question,
          title: PYTHON_TITLES[tier][index],
          statement: "In Pathfinder you built a FastAPI service on PostgreSQL in Python. Explain your approach in detail, including trade-offs and failure handling.",
          resumeEvidence: ["Project Pathfinder: route planner with FastAPI and PostgreSQL in Python"],
          skillsTested: ["Python", "FastAPI"],
        })),
    );
    const result = await generateAssessment(pythonOnlyProfile, { ai, ...sandboxUp });

    expectStructure(result.questions);
    expect(calls).toHaveLength(3);
    const practicalQuestions = result.questions.filter((question) => question.kind === "practical");
    expect(practicalQuestions.every((question) => question.language === "python" && question.source === "template")).toBe(true);
    expect(practicalQuestions[0].statement).toMatch(/Pathfinder/);
  });

  it("uses templates when the sandbox can't start, never unvalidated AI code", async () => {
    const { ai } = fakeModel((tier) => VALID_TIERS[tier]().filter((question) => question.kind === "written"));
    const result = await generateAssessment(typescriptProfile, { ai, sandboxAvailable: async () => false });
    expectStructure(result.questions);
    expect(
      result.questions.filter((question) => question.kind === "practical").every((question) => question.source === "template"),
    ).toBe(true);
  });

  it("rides out a transient model failure by using another attempt", async () => {
    const { ai: base, calls } = fakeModel((tier) => VALID_TIERS[tier]());
    let failed = false;
    const ai = (async (request: Parameters<typeof base>[0]) => {
      if (!failed && request.name === "adept_questions") {
        failed = true;
        throw new AiError("request_failed", "timeout");
      }
      return base(request);
    }) as typeof base;

    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    expectStructure(result.questions);
    expect(result.log.join(" ")).toMatch(/adept attempt 1: request failed/);
    expect(calls.filter((call) => call.tier === "adept")).toHaveLength(1);
  });

  it("stops immediately when the model isn't configured", async () => {
    let calls = 0;
    const ai = (async () => {
      calls++;
      throw new AiError("not_configured", "missing key");
    }) as unknown as GenerationDeps["ai"];
    await expect(generateAssessment(typescriptProfile, { ai, ...sandboxUp })).rejects.toMatchObject({ code: "ai_unavailable" });
    expect(calls).toBe(3);
  });

  it("fails clearly when the candidate claims no supported language", async () => {
    const { ai, calls } = fakeModel((tier) => VALID_TIERS[tier]());
    await expect(generateAssessment(javaOnlyProfile, { ai, ...sandboxUp })).rejects.toMatchObject({
      code: "unsupported_languages",
    });
    expect(calls).toHaveLength(0);
  });

  it("gives up after the retry budget when written questions never validate", async () => {
    const { ai, calls } = fakeModel((tier) =>
      VALID_TIERS[tier]().map((question) => (question.kind === "written" ? { ...question, resumeEvidence: [] } : question)),
    );
    const error = await generateAssessment(typescriptProfile, { ai, ...sandboxUp }, { maxAttempts: 2 }).catch((e) => e);
    expect(error).toBeInstanceOf(GenerationError);
    expect(error.code).toBe("generation_failed");
    // 2 normal attempts plus 2 written-only extra attempts per tier, then stop.
    expect(calls.length).toBeLessThanOrEqual(12);
  });

  it("gives a stubborn written slot extra attempts, with the claimed technologies as guidance", async () => {
    // The Master architecture question names an unclaimed framework for the
    // first four attempts, then follows the feedback.
    const { ai, calls } = fakeModel((tier, attempt) =>
      VALID_TIERS[tier]().map((question) =>
        tier === "master" && question.type === "architecture" && attempt <= 4
          ? { ...question, statement: `${question.statement} Compare the design with a FastAPI service.` }
          : question,
      ),
    );
    const result = await generateAssessment(typescriptProfile, { ai, ...sandboxUp });
    expect(result.questions).toHaveLength(12);
    const master = calls.filter((call) => call.tier === "master");
    expect(master).toHaveLength(5);
    expect(master[4].user).toContain("Only name technologies from this list");
    expect(master[4].user).toContain("TypeScript");
  });
});
