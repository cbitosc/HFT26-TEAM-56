import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ASSESSMENT_MINUTES, TIER_CONFIG, TIERS } from "@/lib/assessment/config";
import { createTestDatabase, migrationFiles, readMigration, type TestDatabase } from "../helpers/database";

// The assessment workflow as the database enforces it: every migration
// applied to a real Postgres (PGlite), exercised as the server and as candidates.

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let t: TestDatabase;
let resumeId: string;

beforeAll(async () => {
  t = await createTestDatabase();
  // Auth users are created by Supabase Auth, not the server role.
  await t.db.query(`insert into auth.users (id, email) values ($1, 'alice@example.com'), ($2, 'bob@example.com')`, [ALICE, BOB]);
});

afterAll(() => t.close());

beforeEach(async () => {
  await t.server("delete from public.assessments");
  await t.server("delete from public.resumes");
  resumeId = randomUUID();
  await t.server(
    `insert into public.resumes (id, user_id, filename, storage_path, status) values ($1, $2, 'alice-cv.pdf', $3, 'analyzed')`,
    [resumeId, ALICE, `${ALICE}/${resumeId}.pdf`],
  );
});

async function createGenerating(userId = ALICE, resume = resumeId) {
  const [row] = await t.server<{ id: string }>(
    `insert into public.assessments (user_id, resume_id, status, generation_stage, duration_minutes, resume_filename, technical_domain)
     values ($1, $2, 'generating', 'analyzing', $3, 'alice-cv.pdf', 'Full-stack web development') returning id`,
    [userId, resume, ASSESSMENT_MINUTES],
  );
  return row.id;
}

/** Twelve rows shaped like saveGeneratedQuestions() builds them. */
function generatedRows({ count = 12 }: { count?: number } = {}) {
  const questions: Record<string, unknown>[] = [];
  const secrets: Record<string, unknown>[] = [];
  let order = 0;
  for (const tier of TIERS) {
    const config = TIER_CONFIG[tier];
    const types = [
      ...Object.entries(config.written).flatMap(([type, n]) => Array(n).fill(type)),
      ...Array(config.practical).fill(config.practicalTypes[0]),
    ];
    for (const type of types) {
      const id = randomUUID();
      const practical = type === "coding" || type === "debugging";
      questions.push({
        id,
        tier,
        difficulty: config.difficulty,
        question_type: type,
        kind: practical ? "practical" : "written",
        title: `${tier} ${type} ${order}`,
        description: "Public statement",
        resume_evidence: ["Built an order dashboard"],
        skills_tested: ["TypeScript"],
        starter_files: practical ? [{ path: "solution.ts", content: "export function solve() {}" }] : [],
        example_tests: practical ? [{ name: "visible", args: [1], expected: 1, expectThrows: false }] : [],
        time_allocation_minutes: 2,
        display_order: order++,
        language: practical ? "typescript" : null,
        entry_point: practical ? "solve" : null,
        ai_assistance: config.aiAssistance,
      });
      secrets.push({
        question_id: id,
        reference_files: practical ? [{ path: "solution.ts", content: "SECRET REFERENCE" }] : [],
        hidden_tests: practical ? [{ name: "hidden", args: [2], expected: 2, hidden: true }] : [],
        grading_criteria: { kind: practical ? "practical" : "written", modelAnswer: "SECRET RUBRIC" },
        validation_report: practical ? { method: "sandbox" } : null,
      });
    }
  }
  return { questions: questions.slice(0, count), secrets: secrets.slice(0, count) };
}

async function save(assessmentId: string, rows = generatedRows(), userId = ALICE) {
  return t.server("select public.save_generated_assessment($1, $2, $3::jsonb, $4::jsonb)", [
    assessmentId,
    userId,
    JSON.stringify(rows.questions),
    JSON.stringify(rows.secrets),
  ]);
}

async function status(assessmentId: string) {
  const [row] = await t.server<{ status: string; generation_stage: string | null; started_at: Date | null; expires_at: Date | null }>(
    "select status, generation_stage, started_at, expires_at from public.assessments where id = $1",
    [assessmentId],
  );
  return row;
}

const countQuestions = async (assessmentId: string) =>
  Number((await t.server<{ n: number }>("select count(*) as n from public.assessment_questions where assessment_id = $1", [assessmentId]))[0].n);

describe("migrations", () => {
  it("apply cleanly a second time (idempotent)", async () => {
    for (const file of migrationFiles()) await t.db.exec(readMigration(file));
  });
});

describe("generation", () => {
  it("allows only one generation in flight per résumé", async () => {
    await createGenerating();
    await expect(createGenerating()).rejects.toThrow(/duplicate key|unique/);
  });

  it("allows a new generation once the previous one failed", async () => {
    const first = await createGenerating();
    await t.server("update public.assessments set status = 'failed', generation_stage = null where id = $1", [first]);
    await expect(createGenerating()).resolves.toBeTruthy();
  });

  it("only accepts known generation stages", async () => {
    const id = await createGenerating();
    await t.server("update public.assessments set generation_stage = 'validating' where id = $1", [id]);
    await expect(
      t.server("update public.assessments set generation_stage = 'almost-done' where id = $1", [id]),
    ).rejects.toThrow(/check constraint/);
  });

  it("saves 12 questions with their secrets and flips to ready atomically", async () => {
    const id = await createGenerating();
    await save(id);
    expect(await status(id)).toMatchObject({ status: "ready", generation_stage: null });
    expect(await countQuestions(id)).toBe(12);
    const perTier = await t.server<{ tier: string; n: number }>(
      "select tier, count(*)::int as n from public.assessment_questions where assessment_id = $1 group by tier order by tier",
      [id],
    );
    expect(perTier).toEqual([
      { tier: "adept", n: 4 },
      { tier: "master", n: 4 },
      { tier: "novice", n: 4 },
    ]);
  });

  it("rejects an incomplete assessment and writes nothing", async () => {
    const id = await createGenerating();
    await expect(save(id, generatedRows({ count: 11 }))).rejects.toThrow(/12 questions/);
    expect(await status(id)).toMatchObject({ status: "generating" });
    expect(await countQuestions(id)).toBe(0);
  });

  it("rejects a wrong tier distribution", async () => {
    const id = await createGenerating();
    const rows = generatedRows();
    rows.questions[0] = { ...rows.questions[0], tier: "master", difficulty: "hard" };
    await expect(save(id, rows)).rejects.toThrow(/4 per tier/);
    expect(await countQuestions(id)).toBe(0);
  });

  it("refuses to save into an assessment that isn't generating, or isn't the user's", async () => {
    const id = await createGenerating();
    await expect(save(id, generatedRows(), BOB)).rejects.toThrow(/not generating/);
    await t.server("update public.assessments set status = 'failed' where id = $1", [id]);
    await expect(save(id)).rejects.toThrow(/not generating/);
    expect(await countQuestions(id)).toBe(0);
  });
});

describe("start and deadline", () => {
  async function readyAssessment() {
    const id = await createGenerating();
    await save(id);
    return id;
  }

  it("starts only from ready, with the deadline from the database clock", async () => {
    const id = await readyAssessment();
    const [started] = await t.server<{ id: string }>("select id from public.start_assessment($1, $2)", [id, ALICE]);
    expect(started.id).toBe(id);
    const row = await status(id);
    expect(row.status).toBe("in_progress");
    const [{ now }] = await t.server<{ now: Date }>("select now() as now");
    expect(Math.abs(row.started_at!.getTime() - now.getTime())).toBeLessThan(60_000);
    expect(row.expires_at!.getTime() - row.started_at!.getTime()).toBe(ASSESSMENT_MINUTES * 60_000);
  });

  it("starting twice keeps the original start time", async () => {
    const id = await readyAssessment();
    await t.server("select public.start_assessment($1, $2)", [id, ALICE]);
    const first = await status(id);
    const again = await t.server("select * from public.start_assessment($1, $2)", [id, ALICE]);
    expect(again).toEqual([]);
    expect((await status(id)).expires_at).toEqual(first.expires_at);
  });

  it("can't start someone else's assessment, or one that isn't ready", async () => {
    const id = await readyAssessment();
    expect(await t.server("select * from public.start_assessment($1, $2)", [id, BOB])).toEqual([]);
    expect((await status(id)).status).toBe("ready");

    const otherResume = randomUUID();
    await t.server(
      `insert into public.resumes (id, user_id, filename, storage_path, status) values ($1, $2, 'b.pdf', $3, 'analyzed')`,
      [otherResume, ALICE, `${ALICE}/${otherResume}.pdf`],
    );
    const generating = await createGenerating(ALICE, otherResume);
    expect(await t.server("select * from public.start_assessment($1, $2)", [generating, ALICE])).toEqual([]);
  });

  it("expires in-progress assessments once the deadline passes", async () => {
    const id = await readyAssessment();
    await t.server("select public.start_assessment($1, $2)", [id, ALICE]);
    expect((await t.server<{ n: number }>("select public.expire_overdue_assessments($1) as n", [ALICE]))[0].n).toBe(0);

    await t.server(
      "update public.assessments set started_at = now() - interval '31 minutes', expires_at = now() - interval '1 minute' where id = $1",
      [id],
    );
    expect((await t.server<{ n: number }>("select public.expire_overdue_assessments($1) as n", [BOB]))[0].n).toBe(0);
    expect((await t.server<{ n: number }>("select public.expire_overdue_assessments($1) as n", [ALICE]))[0].n).toBe(1);
    expect((await status(id)).status).toBe("expired");
  });
});

describe("candidate access (RLS and grants)", () => {
  it("sees only their own assessments and résumés", async () => {
    await createGenerating();
    expect(await t.asUser(ALICE, "select id from public.assessments")).toHaveLength(1);
    expect(await t.asUser(BOB, "select id from public.assessments")).toHaveLength(0);
    expect(await t.asUser(BOB, "select id from public.resumes")).toHaveLength(0);
  });

  it("sees question content only after starting (current stage only), and never the secrets", async () => {
    const id = await createGenerating();
    await save(id);
    expect(await t.asUser(ALICE, "select id from public.assessment_questions")).toHaveLength(0);

    await t.server("select public.start_assessment($1, $2)", [id, ALICE]);
    // Only Novice is open; later stages are covered in stages.test.ts.
    expect(await t.asUser(ALICE, "select id from public.assessment_questions")).toHaveLength(4);
    expect(await t.asUser(BOB, "select id from public.assessment_questions")).toHaveLength(0);
    await expect(t.asUser(ALICE, "select * from public.assessment_question_secrets")).rejects.toThrow(/permission denied/);
  });

  it("can't change status or timing directly", async () => {
    const id = await createGenerating();
    await save(id);
    await expect(
      t.asUser(ALICE, "update public.assessments set status = 'in_progress', started_at = now() where id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(ALICE, "insert into public.assessments (user_id, status, duration_minutes) values ($1, 'ready', 999)", [ALICE]),
    ).rejects.toThrow(/permission denied/);
  });

  it("can't call the server-only workflow functions", async () => {
    const id = await createGenerating();
    await expect(t.asUser(ALICE, "select public.save_generated_assessment($1, $2, '[]', '[]')", [id, ALICE])).rejects.toThrow(/permission denied/);
    await expect(t.asUser(ALICE, "select public.start_assessment($1, $2)", [id, ALICE])).rejects.toThrow(/permission denied/);
    await expect(t.asUser(BOB, "select public.expire_overdue_assessments($1)", [ALICE])).rejects.toThrow(/permission denied/);
  });
});
