import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generatedRows } from "../fixtures/assessment-rows";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

// Grading state as the database enforces it: reports are queued when an
// assessment finishes, claimed by one worker at a time, fenced against
// stale workers, recoverable after a crash, and readable only by their owner.

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let t: TestDatabase;
let assessmentId: string;
let questionIds: string[];

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.query(`insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')`, [ALICE, BOB]);
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.server("delete from public.assessments");
  await t.server("delete from public.resumes");
  const resumeId = randomUUID();
  await t.server(`insert into public.resumes (id, user_id, filename, storage_path, status) values ($1, $2, 'cv.pdf', $3, 'analyzed')`, [
    resumeId,
    ALICE,
    `${ALICE}/${resumeId}.pdf`,
  ]);
  const [row] = await t.server<{ id: string }>(
    `insert into public.assessments (user_id, resume_id, status, generation_stage, duration_minutes) values ($1, $2, 'generating', 'analyzing', 60) returning id`,
    [ALICE, resumeId],
  );
  assessmentId = row.id;
  const rows = generatedRows();
  questionIds = rows.questions.map((q) => q.id as string);
  await t.server("select public.save_generated_assessment($1, $2, $3::jsonb, $4::jsonb)", [assessmentId, ALICE, JSON.stringify(rows.questions), JSON.stringify(rows.secrets)]);
  await t.server("select public.start_assessment($1, $2)", [assessmentId, ALICE]);
});

const finish = async () => {
  for (const tier of ["novice", "adept", "master"]) await t.server("select public.submit_assessment_stage($1, $2, $3)", [assessmentId, ALICE, tier]);
};
const claim = async (userId = ALICE, retry = false, lease = 600) =>
  (await t.server<{ r: { result: string; attempt?: number } }>("select public.claim_assessment_grading($1, $2, $3, $4) as r", [assessmentId, userId, retry, lease]))[0].r;
const complete = async (attempt: number, finalScore = 82.5) =>
  (await t.server<{ ok: boolean }>("select public.complete_assessment_grading($1, $2, $3, $4::jsonb) as ok", [
    assessmentId,
    ALICE,
    attempt,
    JSON.stringify({
      scoringVersion: 1,
      correctnessScore: 56,
      performanceScore: 8.5,
      aiEfficiencyScore: 18,
      finalScore,
      classification: "strong",
      summary: { questionsCompleted: 12 },
      stageResults: [{ tier: "novice", percent: 80 }],
      questionResults: [{ questionId: questionIds[0] }],
      skillsVerification: [],
      aiUsage: { totalHints: 0 },
      recommendations: ["Keep going"],
    }),
  ]))[0].ok;
const failGrading = async (attempt: number) =>
  (await t.server<{ ok: boolean }>("select public.fail_assessment_grading($1, $2, $3, 'Sandbox down') as ok", [assessmentId, ALICE, attempt]))[0].ok;
const result = async () =>
  (await t.server<{ status: string; attempts: number; final_score: string | null; failure_reason: string | null }>(
    "select status, attempts, final_score, failure_reason from public.assessment_results where assessment_id = $1",
    [assessmentId],
  ))[0];

describe("queueing", () => {
  it("queues a pending report when the assessment finishes, by submission or by time", async () => {
    expect(await result()).toBeUndefined();
    await finish();
    expect(await result()).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("queues one when time runs out", async () => {
    await t.server("update public.assessments set started_at = started_at - interval '61 minutes', expires_at = expires_at - interval '61 minutes' where id = $1", [assessmentId]);
    await t.server(
      "update public.assessment_stages set started_at = started_at - interval '61 minutes', expires_at = expires_at - interval '61 minutes' where assessment_id = $1",
      [assessmentId],
    );
    await t.server("select public.sync_assessment_progress($1, $2)", [assessmentId, ALICE]);
    expect(await result()).toMatchObject({ status: "pending" });
  });

  it("refuses to grade an assessment that is still running, or someone else's", async () => {
    expect(await claim()).toEqual({ result: "not_finished" });
    await finish();
    expect(await claim(BOB)).toEqual({ result: "not_found" });
  });
});

describe("claiming (duplicate prevention)", () => {
  beforeEach(finish);

  it("lets one worker grade at a time and stores one report", async () => {
    expect(await claim()).toEqual({ result: "claimed", attempt: 1 });
    expect(await claim()).toEqual({ result: "in_progress" });
    expect(await complete(1)).toBe(true);
    expect(await claim()).toEqual({ result: "completed" });
    expect(await claim(ALICE, true)).toEqual({ result: "completed" });
    expect(await result()).toMatchObject({ status: "completed", final_score: "82.50" });
    const [{ n }] = await t.server<{ n: number }>("select count(*)::int as n from public.assessment_results where assessment_id = $1", [assessmentId]);
    expect(n).toBe(1);
  });

  it("a stale worker can't overwrite a newer attempt", async () => {
    await claim(ALICE, false, -1); // attempt 1 whose lease has already lapsed (crashed worker)
    expect(await claim()).toEqual({ result: "claimed", attempt: 2 });
    expect(await complete(1, 10)).toBe(false);
    expect(await failGrading(1)).toBe(false);
    expect(await complete(2)).toBe(true);
    expect((await result()).final_score).toBe("82.50");
  });

  it("recovers from a failure only through an explicit retry", async () => {
    await claim();
    expect(await failGrading(1)).toBe(true);
    expect(await result()).toMatchObject({ status: "failed", failure_reason: "Sandbox down" });
    expect(await claim()).toEqual({ result: "failed" });
    expect(await claim(ALICE, true)).toEqual({ result: "claimed", attempt: 2 });
    expect((await result()).failure_reason).toBeNull();
  });

  it("a completed report must have every score", async () => {
    await claim();
    await expect(
      t.server("update public.assessment_results set status = 'completed' where assessment_id = $1", [assessmentId]),
    ).rejects.toThrow(/assessment_results_completed_scores/);
  });
});

describe("access", () => {
  beforeEach(async () => {
    await finish();
    await claim();
    await complete(1);
  });

  it("owners read their own report; nobody else does", async () => {
    expect(await t.asUser(ALICE, "select final_score from public.assessment_results")).toHaveLength(1);
    expect(await t.asUser(BOB, "select final_score from public.assessment_results")).toHaveLength(0);
  });

  it("candidates can't write reports, read the audit trail or call grading functions", async () => {
    await expect(t.asUser(ALICE, "update public.assessment_results set final_score = 100")).rejects.toThrow(/permission denied/);
    await expect(t.asUser(ALICE, `insert into public.assessment_results (assessment_id, user_id) values ('${assessmentId}', '${ALICE}')`)).rejects.toThrow(/permission denied/);
    await expect(t.asUser(ALICE, "select * from public.written_evaluations")).rejects.toThrow(/permission denied/);
    for (const sql of [
      `select public.claim_assessment_grading('${assessmentId}', '${ALICE}')`,
      `select public.complete_assessment_grading('${assessmentId}', '${ALICE}', 1, '{}')`,
      `select public.fail_assessment_grading('${assessmentId}', '${ALICE}', 1, 'x')`,
    ]) {
      await expect(t.asUser(ALICE, sql)).rejects.toThrow(/permission denied/);
    }
  });
});
