# Assessment workspace

Once started, an assessment runs as three sequential stages. The candidate sees one stage at a time and one question at a time.

| Stage | Minutes | Questions | AI hints |
| --- | --- | --- | --- |
| Novice (easy) | 15 | 3 theory, 1 coding | Off |
| Adept (medium) | 20 | 1 theory, 1 situational, 2 coding/debugging | On (guarded) |
| Master (hard) | 25 | 2 coding/debugging, 1 architecture/troubleshooting scenario, 1 problem solving | On (guarded) |

Progress runs **Novice → Adept → Master → completed**. Within a stage the candidate can move between its four questions freely. A stage closes when they submit it or when its time runs out. Its answers are then locked and the next stage opens straight away. A closed stage can't be reopened.

## Where the rules live

Everything that decides progression runs in Postgres, in [20261031050000_stage_workflow.sql](../supabase/migrations/20261031050000_stage_workflow.sql). Each function locks the assessment row and uses the database clock:

- `start_assessment`: `ready → in_progress`, 60 minute overall deadline, Novice `active`, Adept and Master `locked`.
- `sync_assessment_progress`: applies every deadline that has passed. A stage that runs out closes **at its deadline**, and the next one opens at that same moment, so the result doesn't depend on when the next request arrives. Several missed deadlines are applied in order. Every server read and write calls it first. It's idempotent.
- `submit_assessment_stage`: closes the active stage early and opens the next one at `now()`. Unused time is never carried over, and no stage runs past the overall deadline. Submitting Master completes the assessment. Repeating the call returns `already_closed` and changes nothing.
- `save_assessment_answer`: autosave. Refused for stages that are locked or closed (`stage_locked` / `stage_closed`) and for locked answers.
- `record_code_execution`: logs a run, or records the single graded submission per question (enforced by a unique index).
- `record_ai_interaction`: logs a hint with its hint number and the latest test result before it. Refused on Novice.
- `sync_overdue_assessments`: a sweep across all candidates for the cron route.

Candidates can read only their own stages, answers and logs, and can't write to any of them. RLS on `assessment_questions` shows a stage's questions only after that stage has opened. Future questions therefore stay hidden from the app API and from direct Supabase queries.

## API

Every route checks the session, the origin (on writes), ownership, the open stage, the question's stage, the deadline and the body (Zod, [requests.ts](../src/lib/assessment/requests.ts)).

| Route | Purpose |
| --- | --- |
| `GET /api/assessments/:id/session` | Stage timers, plus the **open stage's** four questions (public fields) with saved answers, latest runs and hint history. Applies passed deadlines first. |
| `PUT /api/assessments/:id/questions/:qid/answer` | Autosave `{ answerText }` or `{ code }`. |
| `POST /api/assessments/:id/questions/:qid/run` | Saves the code, runs it against the public examples and logs the run. |
| `POST /api/assessments/:id/questions/:qid/submit` | Final submission: graded against every test (hidden included) and locked. Hidden tests are returned only as counts. |
| `POST /api/assessments/:id/questions/:qid/assistant` | Guarded hint, Adept and Master only. |
| `POST /api/assessments/:id/stages/:tier/submit` | Saves any pending edits, submits the stage and returns the new session. |
| `POST /api/assessments/:id/complete` | Submits Master (finalises). Idempotent once finished. |
| `GET /api/cron/assessments` | `Authorization: Bearer $CRON_SECRET`. Closes overdue stages for everyone. |

Rate limits: 10 code executions per minute per user, at most 2 running at once per server process, 6 hints per minute, and 20 hints per question.

## Code execution

[src/lib/execution](../src/lib/execution) runs candidate code outside the app process:

- **Piston** (when `PISTON_URL` is set): JavaScript, TypeScript (types stripped first) and Python, run in Piston's isolated containers. Each run has a 3 s limit, 256 MB of memory and capped output.
- **QuickJS fallback** (no `PISTON_URL`): JavaScript and TypeScript only, in the existing WebAssembly sandbox. It runs in a separate, permission-restricted Node process with no environment, network or filesystem, under the same time and memory limits. Python questions need Piston.

The program sent to the sandbox contains the candidate's code and the test **arguments** only. It reports each return value, and [program.ts](../src/lib/execution/program.ts) compares the values with the expected results on the server. Hidden expected values never enter the sandbox. Code that tampers with `JSON`, prototypes or stdout can only change what it reports, so it can't pass a hidden test without producing the right value. Console output is captured and shown.

Practical answers locked by a stage closing, without an explicit Submit Solution, are graded automatically after the transition (`auto_submit`, [grading.ts](../src/lib/assessment/grading.ts)).

## AI assistant

[src/lib/assistant](../src/lib/assistant) uses the existing OpenAI-compatible client (Featherless or OpenRouter, [client.ts](../src/lib/ai/client.ts)).

- **Context sent:** the question's public fields and examples, the candidate's current work, the latest public run result and the last 6 turns. The prompt builder's input type has no field for secrets.
- **Guardrails** (server-side, using the secrets without sending them): reply length, the number of code lines, a definition of the entry function, code shingles shared with the reference solution, word shingles shared with the rubric's model answer, and hidden-test values. A reply that fails is regenerated once with a correction. If it fails again, a fixed refusal is shown instead. Every exchange is logged with its guardrail outcome.

## Grading

Finishing an assessment queues it for grading. The scoring formula, the pipeline and the report are described in [grading.md](grading.md).

## Workspace UI

[src/components/assessment/workspace](../src/components/assessment/workspace) uses a LeetCode-style split screen:

- **Top bar:** the stage, question number, stage progress, stage time and total time.
- **Toolbar:** a compact `1 2 3 4` navigator with status dots, previous/next, and Submit Stage.
- **Left panel (≈40%):** the question: statement, requirements, examples, constraints, skills and context, plus the collapsible hint panel. It scrolls independently.
- **Right panel (≈60%):** the answer. Coding questions get Monaco, a console and test-results drawer, and Run Code / Submit Solution. Written questions get a full-height editor with a word count, autosave status and Save / Next.
- **Divider:** drag it, or use the arrow keys, between 25% and 65%. The width is remembered on the device, and Monaco relayouts automatically.
- **Small screens:** **Question** / **Answer** tabs replace the columns.
- **Stage submission:** asks for confirmation first.

Autosave ([autosave.ts](../src/lib/assessment/autosave.ts)) is debounced and saves one request per question at a time. Failed saves are retried with backoff, and unsaved edits are mirrored to `localStorage` and restored after a refresh. Everything is flushed before a stage is submitted, and anything still unsaved travels in the submission request. Timers count down on the server's clock. At the deadline the client saves, then reloads the session, and the server applies the transition.

## Environment

```env
# Optional. Self-hosted Piston for sandboxed execution (needed for Python).
PISTON_URL=https://piston.internal
PISTON_API_KEY=                 # if your instance requires an Authorization header
PISTON_RUN_TIMEOUT_MS=3000      # within the instance's configured maximum
PISTON_MEMORY_LIMIT_MB=256
PISTON_JAVASCRIPT_VERSION=*     # semver selector, default any installed
PISTON_PYTHON_VERSION=*

# Optional. Enables GET /api/cron/assessments (e.g. Vercel Cron every minute).
CRON_SECRET=
```

Install the Piston runtimes you need (`node`, `python`). The assistant reuses `FEATHERLESS_*` or `OPENROUTER_*`.
