-- Assessment workflow: generation progress, an atomic save of generated
-- questions, and a start/expiry clock owned by the database.
-- Requires 20261031030000_assessment_generation.sql.

-- Where a `generating` assessment is. Written by the server as generation
-- moves forward; cleared once it's ready or failed.
alter table public.assessments
  add column if not exists generation_stage text;
alter table public.assessments
  drop constraint if exists assessments_generation_stage_check;
alter table public.assessments
  add constraint assessments_generation_stage_check
  check (generation_stage is null
    or generation_stage in ('analyzing', 'generating', 'validating', 'preparing'));

-- What the assessment was generated from, for history. A snapshot, because
-- uploading a new résumé deletes the old one (resume_id becomes null).
alter table public.assessments
  add column if not exists resume_filename text
    check (resume_filename is null or char_length(resume_filename) between 1 and 255),
  add column if not exists technical_domain text
    check (technical_domain is null or char_length(technical_domain) between 1 and 200);

-- ---------------------------------------------------------------------------
-- save_generated_assessment: questions, secrets and the `ready` flip in one
-- transaction. If anything fails (wrong structure, constraint violation, the
-- assessment is no longer generating) nothing is written, so a half-saved
-- assessment can never appear as ready.
-- ---------------------------------------------------------------------------

create or replace function public.save_generated_assessment(
  p_assessment_id uuid,
  p_user_id uuid,
  p_questions jsonb,
  p_secrets jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_bad_tiers integer;
begin
  perform 1
    from public.assessments
   where id = p_assessment_id
     and user_id = p_user_id
     and status = 'generating'
     for update;
  if not found then
    raise exception 'assessment % is not generating', p_assessment_id
      using errcode = 'P0002';
  end if;

  insert into public.assessment_questions (
    id, assessment_id, tier, difficulty, question_type, kind, title, description,
    resume_evidence, skills_tested, starter_files, example_tests,
    time_allocation_minutes, display_order, language, entry_point, ai_assistance
  )
  select
    q.id, p_assessment_id, q.tier, q.difficulty, q.question_type, q.kind, q.title, q.description,
    q.resume_evidence, q.skills_tested, q.starter_files, q.example_tests,
    q.time_allocation_minutes, q.display_order, q.language, q.entry_point, q.ai_assistance
  from jsonb_to_recordset(p_questions) as q(
    id uuid, tier text, difficulty text, question_type text, kind text, title text,
    description text, resume_evidence jsonb, skills_tested jsonb, starter_files jsonb,
    example_tests jsonb, time_allocation_minutes integer, display_order integer,
    language text, entry_point text, ai_assistance boolean
  );

  -- Secrets may only attach to this assessment's questions.
  insert into public.assessment_question_secrets (
    question_id, reference_files, hidden_tests, grading_criteria, validation_report
  )
  select s.question_id, s.reference_files, s.hidden_tests, s.grading_criteria, s.validation_report
  from jsonb_to_recordset(p_secrets) as s(
    question_id uuid, reference_files jsonb, hidden_tests jsonb,
    grading_criteria jsonb, validation_report jsonb
  )
  join public.assessment_questions q
    on q.id = s.question_id and q.assessment_id = p_assessment_id;

  select count(*) into v_total
    from public.assessment_questions where assessment_id = p_assessment_id;
  select count(*) into v_bad_tiers from (
    select t.tier
      from (values ('novice'), ('adept'), ('master')) as t(tier)
      left join public.assessment_questions q
        on q.assessment_id = p_assessment_id and q.tier = t.tier
     group by t.tier
    having count(q.id) <> 4
  ) as wrong;
  if v_total <> 12 or v_bad_tiers <> 0 then
    raise exception 'an assessment needs 12 questions, 4 per tier (got %)', v_total
      using errcode = '23514';
  end if;
  if (select count(*) from public.assessment_question_secrets s
        join public.assessment_questions q on q.id = s.question_id
       where q.assessment_id = p_assessment_id) <> 12 then
    raise exception 'every question needs its secrets row'
      using errcode = '23514';
  end if;

  update public.assessments
     set status = 'ready', generation_stage = null, failure_reason = null
   where id = p_assessment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_assessment: ready -> in_progress with started_at/expires_at from the
-- database clock. The status condition makes it atomic: of two concurrent
-- calls only one updates the row. Returns the row only when this call started it.
-- ---------------------------------------------------------------------------

create or replace function public.start_assessment(p_assessment_id uuid, p_user_id uuid)
returns setof public.assessments
language sql
security invoker
set search_path = ''
as $$
  update public.assessments
     set status = 'in_progress',
         started_at = now(),
         expires_at = now() + make_interval(mins => duration_minutes),
         generation_stage = null
   where id = p_assessment_id
     and user_id = p_user_id
     and status = 'ready'
  returning *;
$$;

-- ---------------------------------------------------------------------------
-- expire_overdue_assessments: in_progress assessments past their deadline
-- become `expired` (by the database clock). Returns how many changed.
-- ---------------------------------------------------------------------------

create or replace function public.expire_overdue_assessments(p_user_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with expired as (
    update public.assessments
       set status = 'expired'
     where user_id = p_user_id
       and status = 'in_progress'
       and expires_at <= now()
    returning 1
  )
  select count(*)::integer from expired;
$$;

-- Server only: these take a user id as an argument, so candidates must not
-- be able to call them (they'd act on someone else's assessment).
revoke all on function public.save_generated_assessment(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.start_assessment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_overdue_assessments(uuid) from public, anon, authenticated;
grant execute on function public.save_generated_assessment(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.start_assessment(uuid, uuid) to service_role;
grant execute on function public.expire_overdue_assessments(uuid) to service_role;
