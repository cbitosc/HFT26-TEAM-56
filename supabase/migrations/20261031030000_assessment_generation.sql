-- Assessment generation: Novice / Adept / Master tiers, practical vs written
-- questions, validation reports, and single-flight generation per résumé.

-- Tiers are now named after the assessment structure.
alter table public.assessment_questions
  drop constraint if exists assessment_questions_tier_check;
alter table public.assessment_questions
  add constraint assessment_questions_tier_check
  check (tier in ('novice', 'adept', 'master'));

alter table public.assessment_questions
  drop constraint if exists assessment_questions_question_type_check;
alter table public.assessment_questions
  add constraint assessment_questions_question_type_check
  check (question_type in (
    'theory', 'situational', 'architecture', 'problem_solving',
    'coding', 'debugging'
  ));

-- Public, candidate-visible details of practical questions.
alter table public.assessment_questions
  add column if not exists kind text not null default 'written'
    check (kind in ('practical', 'written')),
  add column if not exists language text
    check (language is null or language in ('javascript', 'typescript', 'python')),
  add column if not exists entry_point text
    check (entry_point is null or entry_point ~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$'),
  add column if not exists example_tests jsonb not null default '[]'::jsonb
    check (jsonb_typeof(example_tests) = 'array'),
  add column if not exists ai_assistance boolean not null default false;

alter table public.assessment_questions
  drop constraint if exists assessment_questions_practical_fields;
alter table public.assessment_questions
  add constraint assessment_questions_practical_fields
  check (
    (kind = 'practical' and language is not null and entry_point is not null
       and question_type in ('coding', 'debugging'))
    or (kind = 'written' and question_type not in ('coding', 'debugging'))
  );

-- How each practical question was proven (sandbox run or prevalidated template).
alter table public.assessment_question_secrets
  add column if not exists validation_report jsonb;

alter table public.assessments
  add column if not exists failure_reason text;

-- At most one generation in flight per résumé, enforced by the database.
create unique index if not exists assessments_one_generating_per_resume
  on public.assessments (resume_id)
  where status = 'generating';

-- Question content stays hidden until the candidate starts the timer.
-- Before that, the API returns only the structure (tiers, types, minutes),
-- read server-side.
drop policy if exists "Users can view questions in their own assessments"
  on public.assessment_questions;
create policy "Users can view questions in their own assessments"
  on public.assessment_questions for select
  to authenticated
  using (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_id
        and a.user_id = (select auth.uid())
        and a.status in ('in_progress', 'completed', 'expired')
    )
  );
