import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ASSESSMENT_MINUTES, TIER_CONFIG, TIERS, type Tier } from "@/lib/assessment/config";
import { generatedRows } from "../fixtures/assessment-rows";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

// The three-stage workflow as the database enforces it: stage deadlines,
// progression, answer locking, execution and AI logs, and what candidates
// can reach directly. Time passing is simulated by moving timestamps back.

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let t: TestDatabase;
let assessmentId: string;
let questions: { id: string; tier: Tier; kind: string }[];

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.query(`insert into auth.users (id, email) values ($1, 'alice@example.com'), ($2, 'bob@example.com')`, [ALICE, BOB]);
});

afterAll(() => t.close());

beforeEach(async () => {
  await t.server("delete from public.assessments");
  await t.server("delete from public.resumes");
  const resumeId = randomUUID();
  await t.server(
    `insert into public.resumes (id, user_id, filename, storage_path, status) values ($1, $2, 'cv.pdf', $3, 'analyzed')`,
    [resumeId, ALICE, `${ALICE}/${resumeId}.pdf`],
  );
  const [row] = await t.server<{ id: string }>(
    `insert into public.assessments (user_id, resume_id, status, generation_stage, duration_minutes)
     values ($1, $2, 'generating', 'analyzing', 30) returning id`,
    [ALICE, resumeId],
  );
  assessmentId = row.id;
  const rows = generatedRows();
  await t.server("select public.save_generated_assessment($1, $2, $3::jsonb, $4::jsonb)", [
    assessmentId,
    ALICE,
    JSON.stringify(rows.questions),
    JSON.stringify(rows.secrets),
  ]);
  questions = rows.questions.map((q) => ({ id: q.id as string, tier: q.tier as Tier, kind: q.kind as string }));
});

const start = () => t.server("select * from public.start_assessment($1, $2)", [assessmentId, ALICE]);
const sync = async (userId = ALICE) =>
  (await t.server<{ s: string | null }>("select public.sync_assessment_progress($1, $2) as s", [assessmentId, userId]))[0].s;
const submit = async (tier: Tier, userId = ALICE) =>
  (await t.server<{ r: { result: string } }>("select public.submit_assessment_stage($1, $2, $3) as r", [assessmentId, userId, tier]))[0].r;
const save = async (questionId: string, text: string | null, code: string | null = null) =>
  (await t.server<{ r: Record<string, unknown> }>("select public.save_assessment_answer($1, $2, $3, $4, $5) as r", [
    assessmentId,
    ALICE,
    questionId,
    text,
    code,
  ]))[0].r;
const record = async (questionId: string, type: string, outcome = "passed", code = "function solve() {}", passed = 1, total = 1) =>
  (await t.server<{ r: Record<string, unknown> }>(
    "select public.record_code_execution($1, $2, $3, $4, 'quickjs-wasm', $5, $6, $7, 12, $8, '{}'::jsonb) as r",
    [assessmentId, ALICE, questionId, type, outcome, passed, total, code],
  ))[0].r;
const askAi = async (questionId: string) =>
  (await t.server<{ r: Record<string, unknown> }>(
    "select public.record_ai_interaction($1, $2, $3, 'How should I approach this?', 'Think about the empty case.', 'passed', 'test-model') as r",
    [assessmentId, ALICE, questionId],
  ))[0].r;

type StageRow = { tier: Tier; status: string; started_at: Date | null; expires_at: Date | null; submitted_at: Date | null };
const stages = () =>
  t.server<StageRow>(
    "select tier, status, started_at, expires_at, submitted_at from public.assessment_stages where assessment_id = $1 order by position",
    [assessmentId],
  );
const assessment = async () =>
  (await t.server<{ status: string; started_at: Date; expires_at: Date; completed_at: Date | null }>(
    "select status, started_at, expires_at, completed_at from public.assessments where id = $1",
    [assessmentId],
  ))[0];
const answer = async (questionId: string) =>
  (await t.server<{ status: string; answer_text: string | null; code: string | null; revision: number }>(
    "select status, answer_text, code, revision from public.assessment_answers where question_id = $1",
    [questionId],
  ))[0];
const inTier = (tier: Tier, kind?: string) => questions.filter((q) => q.tier === tier && (!kind || q.kind === kind));

/** Pretends `minutes` have passed since the assessment started. */
async function elapse(minutes: number) {
  const shift = `interval '${minutes} minutes'`;
  await t.server(
    `update public.assessments set started_at = started_at - ${shift}, expires_at = expires_at - ${shift},
       completed_at = completed_at - ${shift} where id = $1`,
    [assessmentId],
  );
  await t.server(
    `update public.assessment_stages set started_at = started_at - ${shift}, expires_at = expires_at - ${shift},
       submitted_at = submitted_at - ${shift} where assessment_id = $1`,
    [assessmentId],
  );
}

const minutesBetween = (a: Date | null, b: Date | null) => (b!.getTime() - a!.getTime()) / 60_000;

describe("starting", () => {
  it("opens Novice for 15 minutes with Adept and Master locked, inside a 60 minute deadline", async () => {
    await start();
    const row = await assessment();
    expect(minutesBetween(row.started_at, row.expires_at)).toBe(ASSESSMENT_MINUTES);
    const [novice, adept, master] = await stages();
    expect(novice).toMatchObject({ tier: "novice", status: "active" });
    expect(novice.started_at).toEqual(row.started_at);
    expect(minutesBetween(novice.started_at, novice.expires_at)).toBe(TIER_CONFIG.novice.minutes);
    expect(adept).toMatchObject({ status: "locked", started_at: null });
    expect(master).toMatchObject({ status: "locked", started_at: null });
  });

  it("stage minutes in the database match the config", async () => {
    for (const tier of TIERS) {
      const [{ m }] = await t.server<{ m: number }>("select public.assessment_stage_minutes($1) as m", [tier]);
      expect(m).toBe(TIER_CONFIG[tier].minutes);
    }
  });

  it("refreshing (syncing) repeatedly changes nothing before a deadline", async () => {
    await start();
    const before = await stages();
    for (let i = 0; i < 3; i++) expect(await sync()).toBe("in_progress");
    expect(await stages()).toEqual(before);
  });

  it("gives assessments started before stages existed their stages from the original start", async () => {
    await start();
    await t.server("delete from public.assessment_stages where assessment_id = $1", [assessmentId]);
    await elapse(5);
    await sync();
    const [novice] = await stages();
    expect(novice.status).toBe("active");
    expect(novice.started_at).toEqual((await assessment()).started_at);
  });
});

describe("progression", () => {
  beforeEach(start);

  it("submitting early opens the next stage now, without carrying over unused time", async () => {
    await elapse(5);
    expect(await submit("novice")).toEqual({ result: "submitted" });
    const [novice, adept, master] = await stages();
    expect(novice.status).toBe("submitted");
    expect(adept.status).toBe("active");
    expect(adept.started_at).toEqual(novice.submitted_at);
    expect(minutesBetween(adept.started_at, adept.expires_at)).toBe(TIER_CONFIG.adept.minutes);
    expect(master.status).toBe("locked");
    expect((await assessment()).expires_at).toBeTruthy();
  });

  it("is idempotent: a duplicate submission changes nothing", async () => {
    await submit("novice");
    const after = await stages();
    expect(await submit("novice")).toMatchObject({ result: "already_closed" });
    expect(await stages()).toEqual(after);
  });

  it("can't submit a stage that hasn't opened, or one that isn't yours", async () => {
    expect(await submit("master")).toEqual({ result: "not_active" });
    expect(await submit("novice", BOB)).toEqual({ result: "not_found" });
    expect((await stages()).map((s) => s.status)).toEqual(["active", "locked", "locked"]);
  });

  it("a stage that runs out closes at its deadline and the next opens at that moment", async () => {
    await elapse(16);
    await sync();
    const [novice, adept] = await stages();
    expect(novice.status).toBe("expired");
    expect(novice.submitted_at).toEqual(novice.expires_at);
    expect(adept.status).toBe("active");
    expect(adept.started_at).toEqual(novice.expires_at);
    expect(minutesBetween(adept.started_at, adept.expires_at)).toBe(TIER_CONFIG.adept.minutes);
  });

  it("several missed deadlines are applied in order and finalise the assessment", async () => {
    await elapse(61);
    expect(await sync()).toBe("expired");
    const [novice, adept, master] = await stages();
    expect([novice.status, adept.status, master.status]).toEqual(["expired", "expired", "expired"]);
    expect(adept.started_at).toEqual(novice.expires_at);
    expect(master.started_at).toEqual(adept.expires_at);
    expect((await assessment()).completed_at).toEqual(master.expires_at);
  });

  it("submitting Master completes the assessment", async () => {
    await submit("novice");
    await submit("adept");
    expect(await submit("master")).toEqual({ result: "submitted" });
    expect(await assessment()).toMatchObject({ status: "completed", completed_at: expect.any(Date) });
    expect(await submit("master")).toMatchObject({ result: "already_closed" });
  });

  it("no stage runs past the overall deadline", async () => {
    // A legacy 30 minute assessment: Master would have no time left.
    await t.server("update public.assessments set expires_at = started_at + interval '30 minutes' where id = $1", [assessmentId]);
    await elapse(16);
    await sync();
    const adept = (await stages())[1];
    expect(adept.expires_at).toEqual((await assessment()).expires_at);
    await elapse(15);
    expect(await sync()).toBe("expired");
    const master = (await stages())[2];
    expect(master).toMatchObject({ status: "expired", started_at: null });
  });

  it("the cron sweep advances every overdue assessment", async () => {
    await elapse(16);
    const [{ n }] = await t.server<{ n: number }>("select public.sync_overdue_assessments() as n");
    expect(n).toBe(1);
    expect((await stages())[1].status).toBe("active");
    const [{ n: again }] = await t.server<{ n: number }>("select public.sync_overdue_assessments() as n");
    expect(again).toBe(0);
  });
});

describe("answers", () => {
  beforeEach(start);

  it("saves and restores answers in the active stage, with status from the content", async () => {
    const [theory] = inTier("novice", "written");
    expect(await save(theory.id, "Too short")).toMatchObject({ result: "saved", status: "in_progress", revision: 1 });
    const long = "A closure captures the variables of the scope it was created in, even after that scope returns.";
    expect(await save(theory.id, long)).toMatchObject({ result: "saved", status: "answered", revision: 2 });
    expect(await answer(theory.id)).toMatchObject({ answer_text: long, code: null });
  });

  it("stores code for practical questions and marks it answered after a passing run of that exact code", async () => {
    const [coding] = inTier("novice", "practical");
    expect(await save(coding.id, null, "function solve() { return 1 }")).toMatchObject({ status: "in_progress" });
    await record(coding.id, "run", "passed", "function solve() { return 1 }");
    expect((await answer(coding.id)).status).toBe("answered");
    expect(await save(coding.id, null, "function solve() { return 2 }")).toMatchObject({ status: "in_progress" });
    expect(await save(coding.id, null, "function solve() { return 1 }")).toMatchObject({ status: "answered" });
  });

  it("refuses questions from future stages", async () => {
    const [adeptQuestion] = inTier("adept");
    expect(await save(adeptQuestion.id, "early")).toEqual({ result: "stage_locked" });
    expect(await answer(adeptQuestion.id)).toBeUndefined();
  });

  it("locks a stage's answers when it is submitted, and refuses later edits", async () => {
    const [theory] = inTier("novice", "written");
    await save(theory.id, "My answer");
    await submit("novice");
    expect((await answer(theory.id)).status).toBe("submitted");
    expect(await save(theory.id, "Changed after submitting")).toEqual({ result: "stage_closed" });
    expect((await answer(theory.id)).answer_text).toBe("My answer");
  });

  it("refuses saves once the stage deadline has passed, even before anything else syncs", async () => {
    const [theory] = inTier("novice", "written");
    await save(theory.id, "Saved in time");
    await elapse(15.5);
    expect(await save(theory.id, "Too late")).toEqual({ result: "stage_closed" });
    expect(await answer(theory.id)).toMatchObject({ answer_text: "Saved in time", status: "submitted" });
  });

  it("refuses saves after the assessment is finished, and for other users' assessments", async () => {
    const [theory] = inTier("novice", "written");
    await elapse(61);
    expect(await save(theory.id, "late")).toEqual({ result: "assessment_closed" });
    const [r] = await t.server<{ r: unknown }>("select public.save_assessment_answer($1, $2, $3, 'x', null) as r", [assessmentId, BOB, theory.id]);
    expect(r.r).toEqual({ result: "not_found" });
  });
});

describe("code executions", () => {
  beforeEach(start);

  it("logs runs and accepts one graded submission per question, locking the answer", async () => {
    const [coding] = inTier("novice", "practical");
    await save(coding.id, null, "draft");
    expect(await record(coding.id, "run", "failed", "draft", 0, 1)).toMatchObject({ result: "recorded", hintsBefore: 0 });
    expect(await record(coding.id, "submit", "passed", "final", 3, 3)).toMatchObject({ result: "recorded" });
    expect(await answer(coding.id)).toMatchObject({ status: "submitted", code: "final" });
    expect(await record(coding.id, "submit", "passed", "again", 3, 3)).toEqual({ result: "already_submitted" });
    expect(await save(coding.id, null, "edited")).toEqual({ result: "answer_locked" });
    const rows = await t.server<{ execution_type: string; code: string | null }>(
      "select execution_type, code from public.code_executions where question_id = $1 order by created_at",
      [coding.id],
    );
    expect(rows).toEqual([
      { execution_type: "run", code: null },
      { execution_type: "submit", code: "final" },
    ]);
  });

  it("refuses a submission once its stage has closed, then grades the locked code once", async () => {
    const [coding] = inTier("novice", "practical");
    await save(coding.id, null, "locked code");
    await submit("novice");
    expect(await record(coding.id, "submit", "passed", "locked code")).toEqual({ result: "stage_closed" });
    expect(await record(coding.id, "auto_submit", "failed", "different code")).toEqual({ result: "answer_not_locked" });
    expect(await record(coding.id, "auto_submit", "failed", "locked code", 0, 1)).toMatchObject({ result: "recorded" });
    expect(await record(coding.id, "auto_submit", "failed", "locked code", 0, 1)).toEqual({ result: "already_graded" });
  });

  it("refuses written questions and other users", async () => {
    const [theory] = inTier("novice", "written");
    expect(await record(theory.id, "run")).toEqual({ result: "question_not_found" });
    const [coding] = inTier("novice", "practical");
    const [r] = await t.server<{ r: unknown }>(
      "select public.record_code_execution($1, $2, $3, 'run', 'x', 'passed', 1, 1, 1, 'c', '{}') as r",
      [assessmentId, BOB, coding.id],
    );
    expect(r.r).toEqual({ result: "question_not_found" });
  });
});

describe("AI interactions", () => {
  beforeEach(start);

  it("are refused on Novice questions", async () => {
    for (const question of inTier("novice")) expect(await askAi(question.id)).toEqual({ result: "ai_disabled" });
    expect(await t.server("select * from public.ai_interactions")).toHaveLength(0);
  });

  it("are numbered per question and record the test results before the hint", async () => {
    await submit("novice");
    const [coding] = inTier("adept", "practical");
    await record(coding.id, "run", "failed", "v1", 1, 4);
    expect(await askAi(coding.id)).toEqual({ result: "recorded", hintNumber: 1 });
    expect(await askAi(coding.id)).toEqual({ result: "recorded", hintNumber: 2 });
    const [row] = await t.server<{ tests_passed_before: number; tests_total_before: number; tier: string }>(
      "select tests_passed_before, tests_total_before, tier from public.ai_interactions where question_id = $1 and hint_number = 1",
      [coding.id],
    );
    expect(row).toEqual({ tests_passed_before: 1, tests_total_before: 4, tier: "adept" });
    expect(await record(coding.id, "run", "passed", "v2", 4, 4)).toMatchObject({ hintsBefore: 2 });
  });
});

describe("candidate access", () => {
  beforeEach(start);

  it("sees only the questions of stages that have opened", async () => {
    const visible = async () =>
      (await t.asUser<{ tier: string }>(ALICE, "select tier from public.assessment_questions")).map((q) => q.tier);
    expect(new Set(await visible())).toEqual(new Set(["novice"]));
    expect(await visible()).toHaveLength(4);
    await submit("novice");
    expect(new Set(await visible())).toEqual(new Set(["novice", "adept"]));
    expect(await t.asUser(BOB, "select id from public.assessment_questions")).toHaveLength(0);
  });

  it("reads their own stages, answers and logs, but can't write them", async () => {
    const [theory] = inTier("novice", "written");
    await save(theory.id, "answer");
    expect(await t.asUser(ALICE, "select tier from public.assessment_stages")).toHaveLength(3);
    expect(await t.asUser(ALICE, "select id from public.assessment_answers")).toHaveLength(1);
    expect(await t.asUser(BOB, "select id from public.assessment_stages")).toHaveLength(0);
    expect(await t.asUser(BOB, "select id from public.assessment_answers")).toHaveLength(0);

    const writes = [
      "update public.assessment_stages set expires_at = expires_at + interval '1 hour'",
      "update public.assessment_answers set answer_text = 'forged'",
      `insert into public.code_executions (assessment_id, question_id, user_id, tier, execution_type, runtime, outcome, passed_tests, total_tests, code_sha256)
       values ('${assessmentId}', '${theory.id}', '${ALICE}', 'novice', 'submit', 'x', 'passed', 9, 9, '${"0".repeat(64)}')`,
      "delete from public.ai_interactions",
    ];
    for (const sql of writes) await expect(t.asUser(ALICE, sql)).rejects.toThrow(/permission denied/);
  });

  it("can't call the stage functions", async () => {
    const [theory] = inTier("novice", "written");
    const calls = [
      `select public.sync_assessment_progress('${assessmentId}', '${ALICE}')`,
      `select public.submit_assessment_stage('${assessmentId}', '${ALICE}', 'novice')`,
      `select public.save_assessment_answer('${assessmentId}', '${ALICE}', '${theory.id}', 'x', null)`,
      `select public.record_ai_interaction('${assessmentId}', '${ALICE}', '${theory.id}', 'p', 'r', 'passed', null)`,
      "select public.sync_overdue_assessments()",
    ];
    for (const sql of calls) await expect(t.asUser(ALICE, sql)).rejects.toThrow(/permission denied/);
  });
});
