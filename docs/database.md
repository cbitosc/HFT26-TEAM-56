# Database and storage

Migrations live in [supabase/migrations](../supabase/migrations) and run in filename order:

| Migration | Creates |
| --- | --- |
| `20261031000000_create_profiles.sql` | `profiles` + auto-create trigger (see [authentication.md](authentication.md)) |
| `20261031010000_create_assessment_schema.sql` | `resumes`, `assessments`, `assessment_questions`, `assessment_question_secrets`, the private `resumes` bucket and its policies |
| `20261031020000_resume_upload_limit.sql` | Lowers the `resumes` bucket limit to 5 MB |
| `20261031030000_assessment_generation.sql` | Novice/Adept/Master tiers, practical-question columns, one-generation-per-résumé index, questions hidden until the candidate starts |
| `20261031040000_assessment_workflow.sql` | `generation_stage` for progress, résumé filename/domain snapshot for history, and three server-only functions: `save_generated_assessment` (atomic save), `start_assessment` and `expire_overdue_assessments` (database clock) |
| `20261031050000_stage_workflow.sql` | Three timed stages (`assessment_stages`), `assessment_answers`, `code_executions`, `ai_interactions`; stage-aware question visibility; server-only transition functions (`sync_assessment_progress`, `submit_assessment_stage`, `save_assessment_answer`, `record_code_execution`, `record_ai_interaction`, `sync_overdue_assessments`); `start_assessment` now opens Novice with a 60 minute deadline. See [assessment-workspace.md](assessment-workspace.md) |
| `20261031060000_grading.sql` | `assessment_results` (reports and grading status), server-only `written_evaluations` (rubric audit trail); finishing an assessment queues its report; `claim_` / `complete_` / `fail_assessment_grading` (lease + attempt fencing). See [grading.md](grading.md) |

## Applying

Either:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

or paste each file, in order, into **Supabase → SQL Editor** and run it. Every file is safe to re-run.

Requires Postgres 15+ (all current Supabase projects) for `on delete set null (resume_id)`.

## Access model

| Table | Candidate (publishable key + session) | Server (secret key) |
| --- | --- | --- |
| `resumes` | Read, create, rename and delete **own** rows. Can't set `status`, `extracted_text` or `analysis` | Full access |
| `assessments` | Read **own** rows only | Creates, starts, expires, completes |
| `assessment_questions` | Read questions of **own** assessments, only for stages that have opened (all once finished) | Writes |
| `assessment_stages`, `assessment_answers`, `code_executions`, `ai_interactions` | Read **own** rows only | Writes, only through the stage functions |
| `assessment_results` | Read **own** report only | Writes, only through the grading functions |
| `written_evaluations` | **No access** (holds rubric model answers) | Reads/writes |
| `assessment_question_secrets` | **No access at all** (no grants, RLS with no policies) | Reads/writes reference solutions, hidden tests, grading criteria |

Candidates can't write assessments or timing fields, so they can't extend a timer or mark their own work complete. Platform-derived data is written by server code through `createAdminClient()` ([src/lib/supabase/admin.ts](../src/lib/supabase/admin.ts)), which bypasses RLS. Only call it after verifying the user with `getCurrentUser()`, and never return secret rows to the client.

### Constraints worth knowing

- `resumes.storage_path` must equal `<user_id>/<id>.pdf`, the same key as the storage object.
- `assessments.resume_id` must reference a résumé owned by the same user (composite foreign key). Deleting the résumé keeps the assessment and clears the link.
- `assessments`: `expires_at > started_at`, `completed_at >= started_at`, and `in_progress`/`completed` require the matching timestamps.
- `assessment_questions`: `display_order` is unique per assessment; JSON columns are type-checked (arrays, or an object for `grading_criteria`).
- Statuses are constrained to the values in [src/types/database.ts](../src/types/database.ts).
- `save_generated_assessment` writes questions, secrets and the `ready` status in one transaction and refuses anything but 12 questions (4 per tier), each with a secrets row. A failed save leaves nothing behind.
- `start_assessment` moves `ready` → `in_progress` and sets `started_at = now()`, `expires_at = now() + duration` in a single update, so concurrent starts can't both win and the device clock is never involved. `expire_overdue_assessments` marks passed deadlines `expired`.
- The three functions take a user id, so execute is granted to `service_role` only; candidates get "permission denied".

## Storage

Bucket `resumes`: **private**, PDF only (`application/pdf`), 5 MB limit.

Object key: `<user_id>/<resume_id>.pdf`. Policies on `storage.objects` let an authenticated user upload, read, replace and delete only under their own `<user_id>/` folder, and only names matching `<uuid>/<uuid>.pdf`. Files are served through signed URLs, never public links.

The migration creates the bucket and policies. Check **Storage → Buckets** afterwards: `resumes` should show as private. If the SQL Editor refuses the `storage.objects` policies on your project, create the four policies in **Storage → Policies** with the same conditions.

## Environment

Add the server-only secret key to `.env.local` (**Project Settings → API Keys → Secret keys**):

```env
SUPABASE_SECRET_KEY=sb_secret_...
```

Never prefix it with `NEXT_PUBLIC_`. Nothing in this task calls it yet; résumé processing and assessment generation will.
