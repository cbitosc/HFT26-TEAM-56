import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ASSESSMENT_MINUTES, TIER_CONFIG, TIERS } from "@/lib/assessment/config";
import {
  ANSWERED_MIN_WORDS,
  countWords,
  firstQuestionNumber,
  formatClock,
  nextTier,
  practicalAnswerStatus,
  remainingMs,
  stageTitle,
  writtenAnswerStatus,
} from "@/lib/assessment/stages";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

describe("stage structure", () => {
  it("is Novice 15 → Adept 20 → Master 25, 60 minutes, 4 questions each", () => {
    expect(TIERS).toEqual(["novice", "adept", "master"]);
    expect(TIERS.map((tier) => TIER_CONFIG[tier].minutes)).toEqual([15, 20, 25]);
    expect(ASSESSMENT_MINUTES).toBe(60);
    expect(TIERS.map(nextTier)).toEqual(["adept", "master", null]);
    expect(TIERS.map((tier) => firstQuestionNumber(tier))).toEqual([1, 5, 9]);
  });

  it("allows AI only from Adept", () => {
    expect(TIERS.map((tier) => TIER_CONFIG[tier].aiAssistance)).toEqual([false, true, true]);
  });

  it("matches the required question mix", () => {
    expect(TIER_CONFIG.novice).toMatchObject({ written: { theory: 3 }, practical: 1 });
    expect(TIER_CONFIG.adept).toMatchObject({ written: { theory: 1, situational: 1 }, practical: 2 });
    expect(TIER_CONFIG.master.practical).toBe(2);
  });

  it("formats titles and clocks", () => {
    expect(stageTitle("novice")).toBe("Novice — Easy");
    expect(formatClock(11 * 60_000 + 24_000)).toBe("11:24");
    expect(formatClock(-5)).toBe("00:00");
    expect(remainingMs("2026-10-31T10:00:00.000Z", 0, Date.parse("2026-10-31T09:59:00.000Z"))).toBe(60_000);
    // A device clock that runs ahead doesn't lose time; one that runs behind gains none.
    expect(remainingMs("2026-10-31T10:00:00.000Z", 30_000, Date.parse("2026-10-31T09:59:00.000Z"))).toBe(30_000);
  });
});

describe("answer status", () => {
  it("written: not started, in progress, answered from the word threshold, submitted when locked", () => {
    expect(writtenAnswerStatus("   ", false)).toBe("not_started");
    expect(writtenAnswerStatus("A short start", false)).toBe("in_progress");
    expect(writtenAnswerStatus(Array(ANSWERED_MIN_WORDS).fill("word").join(" "), false)).toBe("answered");
    expect(writtenAnswerStatus("", true)).toBe("submitted");
  });

  it("practical: in progress once edited, answered when the latest passing run used this exact code", () => {
    const starter = "function f() { throw new Error('Not implemented') }";
    expect(practicalAnswerStatus({ code: starter, starter, passingCode: null, locked: false })).toBe("not_started");
    expect(practicalAnswerStatus({ code: "function f() { return 1 }", starter, passingCode: null, locked: false })).toBe("in_progress");
    expect(practicalAnswerStatus({ code: "a", starter, passingCode: "a", locked: false })).toBe("answered");
    expect(practicalAnswerStatus({ code: "a2", starter, passingCode: "a", locked: false })).toBe("in_progress");
    expect(practicalAnswerStatus({ code: "a", starter, passingCode: null, locked: true })).toBe("submitted");
  });

  describe("word count matches the database", () => {
    let t: TestDatabase;
    beforeAll(async () => {
      t = await createTestDatabase();
    });
    afterAll(() => t.close());

    it.each(["", "   ", "one", "  two  words ", "line\nbreaks\tand  tabs", "punctuation, counts as part-of words!"])("%j", async (text) => {
      const [{ n }] = await t.server<{ n: number }>("select public.answer_word_count($1) as n", [text]);
      expect(n).toBe(countWords(text));
    });
  });
});
