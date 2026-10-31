# Grading and performance reports

When an assessment finishes (Master submitted, or time runs out), all 12 questions are graded and a report is stored in `assessment_results`. The candidate sees it at `/dashboard/reports/[assessmentId]`.

## Pipeline

[src/lib/grading/pipeline.ts](../src/lib/grading/pipeline.ts), `gradeAssessment(userId, assessmentId)`:

1. **Claim.** `claim_assessment_grading` confirms the assessment is finished and owned by the user, then takes a 10-minute lease (`pending → grading`, `attempts + 1`).
2. **Coding.** Every attempted coding answer without a graded submission is run against all of its tests (hidden ones included) in the sandbox and recorded as `auto_submit`. Unchanged starter code counts as not attempted. The model is never asked whether code is correct.
3. **Written.** Each non-empty written answer is evaluated by the model against the question's fixed rubric ([written.ts](../src/lib/grading/written.ts)). The evaluation and the rubric snapshot are stored in `written_evaluations` for audit.
4. **Score.** Scores are computed deterministically ([scoring.ts](../src/lib/assessment/scoring.ts)), and the candidate-facing report is built ([report.ts](../src/lib/grading/report.ts)).
5. **Save.** `complete_assessment_grading` stores the report, but only for the attempt that holds the lease.
6. **On error.** `fail_assessment_grading` records a reason the candidate can act on. Answers are never touched.

### Triggers and durability

Grading state lives in the database, not in a request. Each of these triggers is idempotent:

- Submitting Master (stage-submit or `complete` route), and loading the session of a finished assessment, which covers expiry by time. Each runs the pipeline after the response (`after()`, `maxDuration = 300`).
- `GET /api/assessments/:id/results`, polled by the "Evaluating your assessment" screen. It starts grading if the result is pending, or if a worker's lease lapsed (the worker crashed or timed out).
- `GET /api/cron/assessments`. It also grades up to 3 pending or stale results per run.
- `POST /api/assessments/:id/grade`. This is an explicit retry after a failure; failures are not retried automatically.

How duplicates are prevented:

- **One worker at a time:** the lease.
- **No stale writes:** an old worker can't overwrite a newer attempt (attempt fencing).
- **One report per assessment:** `assessment_results.assessment_id` is unique.
- **One graded submission per coding question:** a unique index.
- **No re-billing:** a written evaluation is reused while the answer's SHA-256 is unchanged.

### Written-answer evaluation

This is AI-assisted rubric evaluation, not deterministic grading.

**What the model receives:** the question, its fixed criteria (names, points, descriptions), the key points, red flags, the reference answer, and the candidate's answer. The answer is marked as untrusted data. Nothing about the candidate (name, email, résumé) is sent. Temperature is 0.

**Output:** JSON validated with Zod: `questionId`, `score`, `maxScore`, criterion scores with justifications, `strengths`, `missingConcepts` and `explanation`.

**Checks:** the criteria must match the rubric exactly, each score must be within its criterion's points, and scores are rounded to half points. Totals are recomputed on the server; the model's own totals are ignored. An output that breaks these rules is regenerated once, then fails the question.

**Audit:** the rubric and evaluation are stored in `written_evaluations`, which candidates can't read because it contains the model answer.

## Scoring (version 1)

**Final = Correctness (70) + Performance (10) + AI usage efficiency (20)**, rounded to 0.1.

| Component | Formula |
| --- | --- |
| Correctness, 70 | 70 × the mean correctness over the 12 questions, each weighted equally (70 / 12 points). Coding: graded tests passed / total, hidden included (8 of 10 = 80%). Written: rubric points / rubric maximum. Not attempted: 0. |
| Completion, 4 | 4 × attempted / total |
| Time management, 3 | 3 × stages the candidate submitted themselves (with at least one attempted answer) / 3. Stages that ran out earn nothing. |
| Execution reliability, 3 | 3 × attempted coding questions whose graded code compiled and ran (no compile, runtime, time or memory error) / attempted coding questions |
| Progress per hint, 10 | 10 × the mean gain over Adept/Master questions with hints. Coding: `(after − before) / (1 − before)`, floored at 0, and 1 if the code was already passing; *before* is the best run pass rate before the first hint and *after* the best pass rate after it. Written: the rubric correctness reached. |
| Testing behaviour, 5 | 5 × the mean over attempted Adept/Master coding questions of: 1 for 1-10 runs, 0.5 for none, 0.05 less per run beyond 10 (floor 0.3) |
| Hint efficiency, 5 | 5 × the mean over hinted questions of `correctness × min(1, 3 / hints)` |

**Rules:**

- No hints at all means the full 20 AI points. Not using AI is never penalised.
- Novice is excluded from AI scoring.
- Asking for more hints never raises the score.
- Every AI part is an average over the questions it applies to, so the question mix doesn't change the maximum.
- Performance measures how the work was done, not whether it was right, so it doesn't double-count correctness.
- Raw execution time isn't scored: interpreter timings aren't reliable enough to compare.

**Classification** (internal Vetted ranges, not certification levels): 85–100 Excellent, 70–84 Strong, 50–69 Developing, below 50 Needs Improvement.

## Report contents

The report lives in `assessment_results`, readable by its owner only. It contains:

- the scores and classification
- a summary: questions completed, and the total time from start to finish
- stage results, including time used per stage
- per-question results: score, correctness, status, test counts (hidden tests as counts only), run history, rubric criteria with justifications, strengths, missing concepts, hints used and feedback
- AI usage: hints per stage, and before/after pass rates on hinted questions
- skills verification
- deterministic recommendations

Per-question time isn't tracked, so it's stored as `null` and never estimated.

**Skills verification:** the skills claimed on the résumé (languages, frameworks, databases, tools) are matched against each question's `skillsTested`. A skill's status comes from the mean correctness of the questions that tested it:

- **Demonstrated:** 70% or more.
- **Partially demonstrated:** 40–69%.
- **Not demonstrated in this assessment:** below 40%.
- **Not assessed:** no question tested it. This is shown separately and isn't counted as a failure.

Concepts the questions tested that aren't on the résumé are listed as *assessed concepts*.
