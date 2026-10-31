# Assessment generation

Every assessment has exactly 12 questions in three tiers, 60 minutes in total. Each tier is a timed stage; see [assessment-workspace.md](assessment-workspace.md):

| Tier | Difficulty | Minutes | Questions | AI assistance |
| --- | --- | --- | --- | --- |
| Novice | easy | 15 | 3 theory, 1 coding | No |
| Adept | medium | 20 | 1 theory, 1 situational, 2 coding/debugging | Yes (guarded hints) |
| Master | hard | 25 | 2 coding/debugging, 1 architecture/troubleshooting scenario (the advanced situational question), 1 problem solving | Yes (guarded hints) |

The structure lives in [src/lib/assessment/config.ts](../src/lib/assessment/config.ts) and is enforced by code and database constraints.

## Flow

1. `POST /api/assessments` `{ resumeId? }` checks the session, ownership and that the résumé is analysed. It creates the assessment as `generating` (stage `analyzing`, with the résumé's filename and domain snapshotted for history) and returns `202 { assessmentId, status }`. Generation continues in the background (`after()`). A repeat or concurrent request for the same résumé gets the existing assessment; a partial unique index allows only one `generating` row per résumé. Limit: 5 generations per user per day.
2. The three tiers are generated **in parallel**, each with its own prompt ([prompts.ts](../src/lib/assessment/prompts.ts)) and a tier-specific discriminated-union schema (written vs practical). The model can't emit a type the tier doesn't allow.
3. Every question is validated ([validate.ts](../src/lib/assessment/validate.ts), [grounding.ts](../src/lib/assessment/grounding.ts)):
   - exact type distribution per tier;
   - **grounding**: résumé evidence must cite a real project/role/technology, and at least one tested skill must be claimed;
   - **no unclaimed technologies** (e.g. Kubernetes for a candidate who never lists it) and **no DSA topics** the résumé doesn't mention;
   - no near-duplicate questions within the assessment;
   - written questions carry a rubric (model answer, key points, scored criteria, red flags);
   - practical questions: valid entry function, self-contained code, 5–12 tests with ≥2 visible and ≥3 hidden.
4. **Practical questions run in the sandbox**. The reference must pass every kept test; the starter must fail at least one; a debugging starter must also pass at least one (it's buggy, not empty). Expected values and the reference are written independently, so a test they agree on is confirmed twice. Up to 2 (or 25%) malformed or disputed tests may be dropped and are counted in the validation report. Anything worse fails the question.
5. Retries are bounded: up to 4 model calls per tier and a 170 s overall budget, plus a short window for replacing cross-tier repeats. Retries ask only for the slots still missing, with the exact validation errors as feedback. If practical slots still aren't filled, **prevalidated templates** fill them ([templates.ts](../src/lib/assessment/templates.ts)). If written slots aren't filled, the assessment is marked `failed` with a reason the candidate sees, and they can try again.
6. Questions are saved in **one database transaction** (`save_generated_assessment`): public fields to `assessment_questions`; reference code, the full test suite, rubrics and the validation report to `assessment_question_secrets`; then the status becomes `ready`. The database re-checks 12 questions / 4 per tier, so a partial or failed save can never show as ready.
7. `GET /api/assessments/:id` returns status, generation stage, timing and `serverTime`. Before the candidate starts it returns only the outline (tier, type, minutes); question content is also hidden by RLS until then. `POST /api/assessments/:id/start` calls `start_assessment`, which sets `started_at` and `expires_at` (+60 min) **from the database clock** in one atomic `ready → in_progress` update, opens the Novice stage and reveals its questions. Starting again returns the original times. Secrets are never returned by any endpoint and can't be queried by candidates.

Statuses: `generating` → `ready` → `in_progress` → `completed` or `expired`, or `failed`. A generation stuck in `generating` for 10 minutes is treated as `failed`; an `in_progress` assessment past `expires_at` is shown as `expired` and persisted as such on the next read.

### Progress stages

While generating, `assessments.generation_stage` records real progress (it only moves forward):

| Stage | Shown as | Set when |
| --- | --- | --- |
| `analyzing` | Analysing technical background | The assessment is created |
| `generating` | Generating personalised questions | Tier prompts are sent to the model |
| `validating` | Validating assessment challenges | Every tier's first draft is back; grounding checks, sandbox runs and targeted retries |
| `preparing` | Preparing assessment | Validation is done and questions are being saved |

The dashboard polls `GET /api/assessments/:id` every 3 s (paused while the tab is hidden) and refreshes when the status changes. Generation runs after the response via `after()`, so it doesn't depend on the browser staying open; a refresh shows the same stage. There are no percentages: the generator can't know in advance how many retries it will need.

## Sandbox

[src/lib/sandbox](../src/lib/sandbox) runs untrusted JavaScript/TypeScript in **QuickJS compiled to WebAssembly, in a separate Node process**. AI-generated code never runs in the Next.js server process.

- The guest has no `require`/`import`, `process`, `fetch`, timers, filesystem or network. Nothing from the host is exposed.
- Each job gets a fresh WebAssembly module with a 64 MB memory cap, a 1 MB stack cap and a 3 s deadline. The process has a hard kill timer.
- The process runs under Node's permission model: no child processes, workers, addons or file writes, and reads only the QuickJS package. It gets an empty environment, so no secrets.
- TypeScript is converted with Node's built-in `stripTypeScriptTypes` (`transform` mode) inside the sandbox process.

Tests compare canonical JSON (sorted keys), so the same test cases work across languages. Harnesses are in [harness.ts](../src/lib/assessment/harness.ts).

## Supported languages and limitations

| Candidate claims | Practical questions |
| --- | --- |
| TypeScript or JavaScript | AI-generated and sandbox-validated; template fallback if validation fails |
| Python (without JS/TS) | **Prevalidated templates only**. Python can't be sandboxed safely in-process (Pyodide can reach the host through its JS bridge), so AI-written Python is never marked ready |
| None of the above (e.g. only Java, Go, C++) | Generation fails with a clear message: no runtime to validate practical questions |

Other limitations:

- **Executing candidate submissions in Python** (Task 4) needs a container-grade sandbox (e.g. a self-hosted Piston/Judge0 behind `CODE_EXECUTION_API_URL`, E2B, or Vercel Sandbox). The QuickJS sandbox covers JavaScript/TypeScript only.
- The sandbox evaluates **pure functions**. Real Redis, databases or HTTP are modelled as data passed in as arguments.
- Free-text answers aren't graded by code. Written questions store rubrics for later grading by a reviewer or a guarded model.
- Generation takes about 2–3 minutes with `Qwen/Qwen3-30B-A3B-Instruct-2507`. On Vercel the route sets `maxDuration = 300`; the plan must allow it (Fluid compute). The sandbox runner and QuickJS's WebAssembly are bundled via `outputFileTracingIncludes` in `next.config.ts`.

## Candidate journey (UI)

| State (from the database) | Dashboard shows |
| --- | --- |
| No résumé | Welcome, upload area (drag and drop, PDF up to 5 MB) and the three setup steps |
| Uploading | File name, size and real upload progress (bytes sent) |
| Analysing | Progress steps; after a refresh, the dashboard picks up the in-flight analysis and polls until it settles |
| Résumé ready | Domain, level, skills, projects, experience and **Generate My Assessment** |
| Generating | The four stages above and elapsed time; the button disables while requesting and the server deduplicates |
| Ready | "Your assessment is ready.", the tier breakdown and **Start Assessment** |
| In progress | Time left (server deadline) and **Continue assessment** |
| Failed | The reason and **Try again** |
| Ended | A link to view it and an option to generate a new one |

`/dashboard/assessments` lists every assessment with its date, résumé, domain, question count, duration and status. `/assessment/[id]` shows a started assessment's public question information (statements, starter code, visible examples) with a countdown against the server deadline. The interactive workspace (editor, test runs, submissions, AI assistant) and grading are not built yet.

## Tests

```bash
npm test                             # everything below except live AI
LIVE_AI=1 npx vitest run tests/live  # generates a real assessment with the configured model (uses credits)
```

| Suite | Covers |
| --- | --- |
| `tests/resumes` | PDF upload checks (extension, MIME, signature, size), corrupt, encrypted, too-long, scanned and non-technical PDFs, text sanitising |
| `tests/assessment` | Schemas, grounding, distribution, templates, generation with a scripted model, the runner's stages and failure handling, the candidate view |
| `tests/sandbox` | Isolation, limits and test running in QuickJS |
| `tests/database` | Every migration on PGlite: duplicate generation, atomic save and rollback, start and deadline from the database clock, expiry, RLS ownership, secrets inaccessible, server-only functions |
| `tests/api` | Route handlers: auth, origin, ownership, invalid ids, duplicate requests, rate limit, start rules |
