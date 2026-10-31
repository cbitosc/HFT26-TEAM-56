import { describe, expect, it } from "vitest";
import { fullTierNeed } from "@/lib/assessment/config";
import {
  buildClaims,
  isGroundedEvidence,
  isSupportedSkill,
  unsupportedDsaTopics,
  unsupportedTechnologies,
} from "@/lib/assessment/grounding";
import type { ModelPracticalQuestion, ModelQuestion } from "@/lib/assessment/schemas";
import {
  allocateMinutes,
  checkDistribution,
  checkPracticalStatic,
  isDuplicateTitle,
  parseTestCases,
} from "@/lib/assessment/validate";
import { VALID_TIERS, practical } from "../fixtures/fake-model";
import { typescriptProfile } from "../fixtures/profiles";

const claims = buildClaims(typescriptProfile);

describe("grounding", () => {
  it("accepts claimed skills, including paraphrases and implied ones", () => {
    for (const skill of ["TypeScript", "Node.js", "postgres", "REST API design", "JavaScript", "SQL", "Redis caching"]) {
      expect(isSupportedSkill(skill, claims), skill).toBe(true);
    }
  });

  it("rejects skills that aren't claimed", () => {
    for (const skill of ["Kotlin", "Kubernetes", "GraphQL", "Machine learning"]) {
      expect(isSupportedSkill(skill, claims), skill).toBe(false);
    }
  });

  it("doesn't treat the candidate's name as a claim", () => {
    expect(isSupportedSkill("Priya", claims)).toBe(false);
  });

  it("requires evidence that cites the profile", () => {
    expect(isGroundedEvidence("Project RateKeeper: token-bucket limiter using Redis", claims)).toBe(true);
    expect(isGroundedEvidence("Software Engineer at Finlytics building FastAPI services", claims)).toBe(true);
    expect(isGroundedEvidence("General programming background", claims)).toBe(false);
  });

  it("flags unclaimed technologies but not ordinary English", () => {
    expect(unsupportedTechnologies("Deploy it on Kubernetes and stream events to Kafka", claims)).toEqual(["Kafka", "Kubernetes"]);
    expect(unsupportedTechnologies("How would the service react when Redis goes down? Express your answer clearly.", claims)).toEqual([]);
    expect(unsupportedTechnologies("Use React and Express with PostgreSQL", claims)).toEqual([]);
  });

  it("flags DSA topics only when the résumé doesn't mention them", () => {
    expect(unsupportedDsaTopics("Use dynamic programming to minimise cost", claims)).toEqual(["dynamic programming"]);
    expect(unsupportedDsaTopics("Use a heap to track memory usage? No: check the heap size limit", claims)).toEqual(["heaps"]);
    expect(unsupportedDsaTopics("Paginate the orders and validate input", claims)).toEqual([]);

    const withDsa = buildClaims({ ...typescriptProfile, dsaTopics: ["dynamic programming", "graphs"] });
    expect(unsupportedDsaTopics("Use dynamic programming and a BFS over the graph", withDsa)).toEqual([]);
  });
});

describe("structure", () => {
  it("accepts the exact distribution per tier", () => {
    expect(checkDistribution(VALID_TIERS.novice() as ModelQuestion[], fullTierNeed("novice", 1))).toEqual([]);
    expect(checkDistribution(VALID_TIERS.adept() as ModelQuestion[], fullTierNeed("adept", 2))).toEqual([]);
    expect(checkDistribution(VALID_TIERS.master() as ModelQuestion[], fullTierNeed("master", 2))).toEqual([]);
  });

  it("checks only the requested slots on a retry", () => {
    const adept = VALID_TIERS.adept() as ModelQuestion[];
    const need = { written: { theory: 0, situational: 1 }, practical: 1 };
    expect(checkDistribution([adept[1], adept[2]], need)).toEqual([]);
    expect(checkDistribution(adept, need).join(" ")).toMatch(/exactly 2 questions/);
  });

  it("rejects wrong counts and type mixes", () => {
    const novice = VALID_TIERS.novice() as ModelQuestion[];
    expect(checkDistribution(novice.slice(0, 3), fullTierNeed("novice", 1))).not.toEqual([]);
    const fourTheory = [...novice.slice(0, 3), { ...novice[0], title: "x" }] as ModelQuestion[];
    expect(checkDistribution(fourTheory, fullTierNeed("novice", 1)).join(" ")).toMatch(/exactly 1 practical/);
    const adept = VALID_TIERS.adept() as ModelQuestion[];
    const wrongType = [{ ...adept[0], type: "situational" }, ...adept.slice(1)] as ModelQuestion[];
    expect(checkDistribution(wrongType, fullTierNeed("adept", 2)).join(" ")).toMatch(/"theory"/);
  });

  it("allocates minutes to exactly the tier total", () => {
    expect(allocateMinutes(15, [3, 3, 3, 5]).reduce((a, b) => a + b)).toBe(15);
    expect(allocateMinutes(20, [1, 1, 1, 1])).toEqual([5, 5, 5, 5]);
    expect(allocateMinutes(25, [0, -2, 100, 7]).every((m) => m >= 1)).toBe(true);
    expect(allocateMinutes(25, [0, -2, 100, 7]).reduce((a, b) => a + b)).toBe(25);
  });

  it("detects near-duplicate titles", () => {
    expect(isDuplicateTitle("Paginate the Orders API results", "Paginate Orders API results")).toBe(true);
    expect(isDuplicateTitle("Paginate the Orders API results", "Paginating Orders API results")).toBe(true);
    expect(
      isDuplicateTitle("Implement a Token-Bucket Rate Limiter with Redis", "Build a Redis-backed Token Bucket Rate Limiter"),
    ).toBe(true);
    // Shared filler ("Implement", "for the", "Orders API") alone isn't a repeat.
    expect(
      isDuplicateTitle("Implement a paginated list function for the Orders API", "Implement a ledger replay for the Orders API"),
    ).toBe(false);
    expect(isDuplicateTitle("Paginate the Orders API results", "Rate limiting in RateKeeper")).toBe(false);
  });
});

describe("practical static checks", () => {
  const base = practical("paginate") as unknown as ModelPracticalQuestion;

  it("accepts a well-formed question", () => {
    expect(checkPracticalStatic(base, claims, ["typescript", "javascript"]).issues).toEqual([]);
  });

  it("rejects malformed or too few tests", () => {
    const question = { ...base, tests: [{ name: "a", argsJson: "{not json", expectedJson: "1", expectThrows: false, hidden: false }] };
    const { issues } = parseTestCases(question);
    expect(issues.join(" ")).toMatch(/argsJson is not valid JSON/);
    expect(issues.join(" ")).toMatch(/Provide 5-12 valid test cases/);
  });

  it("rejects languages the candidate can't be tested in, imports and missing entry points", () => {
    const issues = checkPracticalStatic(
      { ...base, language: "python" as never, starterCode: "import fs from 'fs'\nconst x = 1" },
      claims,
      ["typescript"],
    ).issues.join(" ");
    expect(issues).toMatch(/Language must be one of/);
    expect(issues).toMatch(/no import, export or require/);
    expect(issues).toMatch(/must declare `function paginate/);
  });

  it("rejects starter code identical to the reference", () => {
    const issues = checkPracticalStatic({ ...base, starterCode: base.referenceCode }, claims, ["typescript"]).issues;
    expect(issues.join(" ")).toMatch(/must differ/);
  });
});
