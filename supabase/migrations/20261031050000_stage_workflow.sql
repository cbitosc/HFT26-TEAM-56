-- Three timed stages (Novice 15 min -> Adept 20 min -> Master 25 min, 60 in
-- total), candidate answers, code execution and AI assistant logs.
-- Requires 20261031040000_assessment_workflow.sql.
--
-- Every transition runs inside a function that locks the assessment row and
-- reads the database clock, so stage progression is atomic, idempotent and
-- independent of the browser:
--   * sync_assessment_progress closes stages whose deadline passed, locks their
--     answers and opens the next stage at the moment the previous one ended.
--   * submit_assessment_stage closes the active stage early and opens the next.
--   * save_assessment_answer / record_code_execution only write while the
--     question's stage is active.
-- Candidates can read their own rows but write nothing directly.

-- Stage lengths. Mirrors TIER_CONFIG in src/lib/assessment/config.ts.
create or replace function public.assessment_stage_minutes(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier when 'novice' then 15 when 'adept' then 20 when 'master' then 25 end;
$$;

-- Targets for the composite foreign keys below, so a stage, answer or log row
-- can only point at an assessment (and question) of the same candidate.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assessments_id_user_id_key') then
    alter table public.assessments add constraint assessments_id_user_id_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_questions_id_assessment_id_key') then
    alter table public.assessment_questions
      add constraint assessment_questions_id_assessment_id_key unique (id, assessment_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- assessment_stages: one row per tier, created when the assessment starts.
--   locked -> active -> submitted (candidate) | expired (deadline)
-- A stage that was never reached because time ran out is expired with no start.
-- ---------------------------------------------------------------------------

create table if not exists public.assessment_stages (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  user_id uuid not null,
  tier text not null check (tier in ('novice', 'adept', 'master')),
  position smallint not null check (position between 1 and 3),
  status text not null default 'locked'
    check (status in ('locked', 'active', 'submitted', 'expired')),
  duration_minutes integer not null check (duration_minutes between 1 and 480),
  started_at timestamptz,
  expires_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint assessment_stages_assessment_fk
    foreign key (assessment_id, user_id)
    references public.assessments (id, user_id) on delete cascade,
  constraint assessment_stages_tier_key unique (assessment_id, tier),
  constraint assessment_stages_position_key unique (assessment_id, position),
  constraint assessment_stages_tier_position
    check ((tier = 'novice' and position = 1) or (tier = 'adept' and position = 2) or (tier = 'master' and position = 3)),
  constraint assessment_stages_timing check (
    (status = 'locked' and started_at is null and expires_at is null and submitted_at is null)
    or (status = 'active' and started_at is not null and expires_at > started_at and submitted_at is null)
    or (status = 'submitted' and started_at is not null and expires_at > started_at and submitted_at >= started_at)
    or (status = 'expired' and submitted_at is not null
        and (started_at is null or (expires_at > started_at and submitted_at >= started_at)))
  )
);

-- At most one stage is open at a time.
create unique index if not exists assessment_stages_one_active
  on public.assessment_stages (assessment_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- assessment_answers: the candidate's latest written answer or code per
-- question. Locked (status = submitted) when the question's solution is
-- submitted or its stage closes.
-- ---------------------------------------------------------------------------

create table if not exists public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  question_id uuid not null,
  user_id uuid not null,
  tier text not null check (tier in ('novice', 'adept', 'master')),
  answer_text text check (answer_text is null or char_length(answer_text) <= 20000),
  code text check (code is null or char_length(code) <= 100000),
  language text check (language is null or language in ('javascript', 'typescript', 'python')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'answered', 'submitted')),
  revision integer not null default 1 check (revision >= 1),
  saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint assessment_answers_assessment_fk
    foreign key (assessment_id, user_id)
    references public.assessments (id, user_id) on delete cascade,
  constraint assessment_answers_question_fk
    foreign key (question_id, assessment_id)
    references public.assessment_questions (id, assessment_id) on delete cascade,
  constraint assessment_answers_question_key unique (question_id),
  constraint assessment_answers_submitted_at
    check ((status = 'submitted') = (submitted_at is not null))
);

create index if not exists assessment_answers_assessment_tier_idx
  on public.assessment_answers (assessment_id, tier);

-- ---------------------------------------------------------------------------
-- code_executions: every Run Code and graded submission. `results` holds
-- public test results only ({ tests, hidden: { passed, total }, logs, error });
-- hidden tests appear as counts.
-- ---------------------------------------------------------------------------

create table if not exists public.code_executions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  question_id uuid not null,
  user_id uuid not null,
  tier text not null check (tier in ('novice', 'adept', 'master')),
  execution_type text not null check (execution_type in ('run', 'submit', 'auto_submit')),
  runtime text not null check (char_length(runtime) between 1 and 40),
  outcome text not null check (outcome in (
    'passed', 'failed', 'compile_error', 'runtime_error', 'timeout', 'memory_limit', 'output_limit', 'error'
  )),
  passed_tests integer not null check (passed_tests >= 0),
  total_tests integer not null check (total_tests >= passed_tests),
  execution_time_ms integer check (execution_time_ms is null or execution_time_ms >= 0),
  code_sha256 text not null check (code_sha256 ~ '^[0-9a-f]{64}$'),
  -- Kept for graded submissions; runs keep only the hash.
  code text check (code is null or char_length(code) <= 100000),
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  -- AI hints taken on this question before this execution, for usage scoring.
  hints_before integer not null default 0 check (hints_before >= 0),
  created_at timestamptz not null default now(),

  constraint code_executions_assessment_fk
    foreign key (assessment_id, user_id)
    references public.assessments (id, user_id) on delete cascade,
  constraint code_executions_question_fk
    foreign key (question_id, assessment_id)
    references public.assessment_questions (id, assessment_id) on delete cascade
);

-- One graded submission per question.
create unique index if not exists code_executions_one_grading_per_question
  on public.code_executions (question_id)
  where execution_type in ('submit', 'auto_submit');
create index if not exists code_executions_question_created_idx
  on public.code_executions (question_id, created_at);
create index if not exists code_executions_user_created_idx
  on public.code_executions (user_id, created_at desc);
create index if not exists code_executions_assessment_idx
  on public.code_executions (assessment_id);

-- ---------------------------------------------------------------------------
-- ai_interactions: every assistant exchange. Novice has no AI, so the tier
-- can only be adept or master.
-- ---------------------------------------------------------------------------

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  question_id uuid not null,
  user_id uuid not null,
  tier text not null check (tier in ('adept', 'master')),
  hint_number integer not null check (hint_number >= 1),
  candidate_prompt text not null check (char_length(candidate_prompt) between 1 and 2000),
  assistant_response text not null check (char_length(assistant_response) between 1 and 8000),
  -- passed: sent as written; rewritten: regenerated after a guardrail hit;
  -- blocked: replaced with a refusal.
  guardrail text not null check (guardrail in ('passed', 'rewritten', 'blocked')),
  model text check (model is null or char_length(model) <= 200),
  -- The latest Run Code result on this question when the hint was asked.
  tests_passed_before integer check (tests_passed_before is null or tests_passed_before >= 0),
  tests_total_before integer check (tests_total_before is null or tests_total_before >= 0),
  created_at timestamptz not null default now(),

  constraint ai_interactions_assessment_fk
    foreign key (assessment_id, user_id)
    references public.assessments (id, user_id) on delete cascade,
  constraint ai_interactions_question_fk
    foreign key (question_id, assessment_id)
    references public.assessment_questions (id, assessment_id) on delete cascade,
  constraint ai_interactions_hint_key unique (question_id, hint_number)
);

create index if not exists ai_interactions_user_created_idx
  on public.ai_interactions (user_id, created_at desc);
create index if not exists ai_interactions_assessment_idx
  on public.ai_interactions (assessment_id);

-- ---------------------------------------------------------------------------
-- Access: candidates read their own rows. All writes go through the
-- server-only functions below.
-- ---------------------------------------------------------------------------

alter table public.assessment_stages enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.code_executions enable row level security;
alter table public.ai_interactions enable row level security;

drop policy if exists "Users can view their own stages" on public.assessment_stages;
create policy "Users can view their own stages"
  on public.assessment_stages for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own answers" on public.assessment_answers;
create policy "Users can view their own answers"
  on public.assessment_answers for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own code executions" on public.code_executions;
create policy "Users can view their own code executions"
  on public.code_executions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own AI interactions" on public.ai_interactions;
create policy "Users can view their own AI interactions"
  on public.ai_interactions for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.assessment_stages from anon, authenticated;
revoke all on public.assessment_answers from anon, authenticated;
revoke all on public.code_executions from anon, authenticated;
revoke all on public.ai_interactions from anon, authenticated;
grant select on public.assessment_stages to authenticated;
grant select on public.assessment_answers to authenticated;
grant select on public.code_executions to authenticated;
grant select on public.ai_interactions to authenticated;

-- A stage's questions become visible only once that stage has opened, so
-- future-stage questions can't be read through the API either.
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
        and (
          a.status in ('completed', 'expired')
          or (
            a.status = 'in_progress'
            and exists (
              select 1
              from public.assessment_stages s
              where s.assessment_id = a.id
                and s.tier = assessment_questions.tier
                and s.status <> 'locked'
            )
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Internal helpers. Callers hold the assessment row lock.
-- ---------------------------------------------------------------------------

create or replace function public.init_assessment_stages(
  p_assessment_id uuid,
  p_user_id uuid,
  p_started_at timestamptz,
  p_deadline timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.assessment_stages
    (assessment_id, user_id, tier, position, status, duration_minutes, started_at, expires_at)
  values
    (p_assessment_id, p_user_id, 'novice', 1, 'active', public.assessment_stage_minutes('novice'),
     p_started_at,
     least(p_started_at + make_interval(mins => public.assessment_stage_minutes('novice')), p_deadline)),
    (p_assessment_id, p_user_id, 'adept', 2, 'locked', public.assessment_stage_minutes('adept'), null, null),
    (p_assessment_id, p_user_id, 'master', 3, 'locked', public.assessment_stage_minutes('master'), null, null)
  on conflict (assessment_id, tier) do nothing;
$$;

-- Closes a stage and locks every answer in it.
create or replace function public.close_assessment_stage(p_stage_id uuid, p_status text, p_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment_id uuid;
  v_tier text;
begin
  update public.assessment_stages
     set status = p_status, submitted_at = greatest(p_at, started_at)
   where id = p_stage_id and status = 'active'
  returning assessment_id, tier into v_assessment_id, v_tier;
  if not found then return; end if;

  update public.assessment_answers
     set status = 'submitted', submitted_at = p_at
   where assessment_id = v_assessment_id and tier = v_tier and status <> 'submitted';
end;
$$;

-- Opens the stage after `p_after_position` at `p_at`. Returns false when there
-- is no next stage, or no time left for it (then it's marked expired).
create or replace function public.open_next_assessment_stage(
  p_assessment_id uuid,
  p_after_position integer,
  p_at timestamptz,
  p_deadline timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next public.assessment_stages;
begin
  select * into v_next
    from public.assessment_stages
   where assessment_id = p_assessment_id
     and position = p_after_position + 1
     and status = 'locked'
     for update;
  if not found then return false; end if;

  if p_at >= p_deadline then
    update public.assessment_stages
       set status = 'expired', submitted_at = p_deadline
     where assessment_id = p_assessment_id and status = 'locked';
    return false;
  end if;

  update public.assessment_stages
     set status = 'active',
         started_at = p_at,
         -- Unused time from earlier stages never carries over, and no stage
         -- runs past the overall deadline.
         expires_at = least(p_at + make_interval(mins => duration_minutes), p_deadline)
   where id = v_next.id;
  return true;
end;
$$;

create or replace function public.finish_assessment(p_assessment_id uuid, p_status text, p_at timestamptz)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.assessment_stages
     set status = 'expired', submitted_at = p_at
   where assessment_id = p_assessment_id and status = 'locked';
  update public.assessment_answers
     set status = 'submitted', submitted_at = p_at
   where assessment_id = p_assessment_id and status <> 'submitted';
  update public.assessments
     set status = p_status, completed_at = greatest(p_at, started_at)
   where id = p_assessment_id and status = 'in_progress';
$$;

-- ---------------------------------------------------------------------------
-- sync_assessment_progress: applies every deadline that has passed, by the
-- database clock. A stage that ran out closes at its deadline and the next
-- one opens at that same moment, so the outcome doesn't depend on when the
-- next request arrives. Safe to call any number of times. Returns the
-- assessment status afterwards, or null if it isn't this user's.
-- ---------------------------------------------------------------------------

create or replace function public.sync_assessment_progress(p_assessment_id uuid, p_user_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment public.assessments;
  v_stage public.assessment_stages;
  v_end timestamptz;
begin
  select * into v_assessment
    from public.assessments
   where id = p_assessment_id and user_id = p_user_id
     for update;
  if not found then return null; end if;
  if v_assessment.status <> 'in_progress' then return v_assessment.status; end if;

  -- Assessments started before stages existed get them from their original start.
  if not exists (select 1 from public.assessment_stages where assessment_id = p_assessment_id) then
    perform public.init_assessment_stages(
      p_assessment_id, p_user_id, v_assessment.started_at, v_assessment.expires_at);
  end if;

  loop
    select * into v_stage
      from public.assessment_stages
     where assessment_id = p_assessment_id and status = 'active';
    if not found then
      perform public.finish_assessment(p_assessment_id, 'completed', now());
      exit;
    end if;

    v_end := least(v_stage.expires_at, v_assessment.expires_at);
    exit when now() < v_end;

    perform public.close_assessment_stage(v_stage.id, 'expired', v_end);
    if not public.open_next_assessment_stage(p_assessment_id, v_stage.position, v_end, v_assessment.expires_at) then
      perform public.finish_assessment(p_assessment_id, 'expired', v_end);
      exit;
    end if;
  end loop;

  return (select status from public.assessments where id = p_assessment_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_assessment: ready -> in_progress, 60 minutes from the database clock,
-- with Novice open and Adept/Master locked. Returns the row only when this
-- call started it, so concurrent starts can't both win.
-- ---------------------------------------------------------------------------

create or replace function public.start_assessment(p_assessment_id uuid, p_user_id uuid)
returns setof public.assessments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_minutes integer := public.assessment_stage_minutes('novice')
    + public.assessment_stage_minutes('adept')
    + public.assessment_stage_minutes('master');
  v_row public.assessments;
begin
  update public.assessments
     set status = 'in_progress',
         started_at = now(),
         duration_minutes = v_minutes,
         expires_at = now() + make_interval(mins => v_minutes),
         generation_stage = null
   where id = p_assessment_id
     and user_id = p_user_id
     and status = 'ready'
  returning * into v_row;
  if not found then return; end if;

  perform public.init_assessment_stages(v_row.id, v_row.user_id, v_row.started_at, v_row.expires_at);
  return next v_row;
end;
$$;

-- In-progress assessments of this user whose deadlines passed are advanced
-- or finalized. Returns how many finished.
create or replace function public.expire_overdue_assessments(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_finished integer := 0;
begin
  for v_id in
    select id from public.assessments where user_id = p_user_id and status = 'in_progress'
  loop
    if public.sync_assessment_progress(v_id, p_user_id) <> 'in_progress' then
      v_finished := v_finished + 1;
    end if;
  end loop;
  return v_finished;
end;
$$;

-- Scheduled sweep across all candidates (cron), so stages close even when
-- nobody makes a request. Returns how many assessments it touched.
create or replace function public.sync_overdue_assessments()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select a.id, a.user_id
      from public.assessments a
     where a.status = 'in_progress'
       and (
         a.expires_at <= now()
         or not exists (select 1 from public.assessment_stages s where s.assessment_id = a.id)
         or exists (
           select 1 from public.assessment_stages s
            where s.assessment_id = a.id and s.status = 'active' and s.expires_at <= now()
         )
       )
  loop
    perform public.sync_assessment_progress(v_row.id, v_row.user_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_assessment_stage: the candidate closes the active stage early. The
-- next stage opens immediately; submitting Master completes the assessment.
-- Repeating it (double click, retry) reports `already_closed` and changes nothing.
-- ---------------------------------------------------------------------------

create or replace function public.submit_assessment_stage(p_assessment_id uuid, p_user_id uuid, p_tier text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_stage public.assessment_stages;
  v_deadline timestamptz;
begin
  v_status := public.sync_assessment_progress(p_assessment_id, p_user_id);
  if v_status is null then return jsonb_build_object('result', 'not_found'); end if;

  select * into v_stage
    from public.assessment_stages
   where assessment_id = p_assessment_id and tier = p_tier
     for update;
  if not found then return jsonb_build_object('result', 'not_started'); end if;
  if v_stage.status in ('submitted', 'expired') then
    return jsonb_build_object('result', 'already_closed', 'stageStatus', v_stage.status);
  end if;
  if v_stage.status = 'locked' then return jsonb_build_object('result', 'not_active'); end if;

  select expires_at into v_deadline from public.assessments where id = p_assessment_id;
  perform public.close_assessment_stage(v_stage.id, 'submitted', now());
  if not public.open_next_assessment_stage(p_assessment_id, v_stage.position, now(), v_deadline) then
    perform public.finish_assessment(p_assessment_id, 'completed', now());
  end if;
  return jsonb_build_object('result', 'submitted');
end;
$$;

-- Word count used for a written answer's status. Mirrors countWords() in
-- src/lib/assessment/stages.ts.
create or replace function public.answer_word_count(p_text text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_text is null or p_text !~ '\S' then 0
    else coalesce(array_length(regexp_split_to_array(regexp_replace(p_text, '^\s+|\s+$', '', 'g'), '\s+'), 1), 0)
  end;
$$;

create or replace function public.code_sha256(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- save_assessment_answer: autosave. Only while the question's stage is open
-- and the answer isn't locked. Status: written answers are `answered` from
-- 10 words; code is `answered` once a Run Code on exactly this code passed
-- every public test.
-- ---------------------------------------------------------------------------

create or replace function public.save_assessment_answer(
  p_assessment_id uuid,
  p_user_id uuid,
  p_question_id uuid,
  p_answer_text text,
  p_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_question record;
  v_stage_status text;
  v_answer_status text;
  v_answer public.assessment_answers;
begin
  v_status := public.sync_assessment_progress(p_assessment_id, p_user_id);
  if v_status is null then return jsonb_build_object('result', 'not_found'); end if;
  if v_status <> 'in_progress' then return jsonb_build_object('result', 'assessment_closed'); end if;

  select id, tier, kind, language into v_question
    from public.assessment_questions
   where id = p_question_id and assessment_id = p_assessment_id;
  if not found then return jsonb_build_object('result', 'question_not_found'); end if;

  select status into v_stage_status
    from public.assessment_stages
   where assessment_id = p_assessment_id and tier = v_question.tier;
  if v_stage_status is distinct from 'active' then
    return jsonb_build_object('result', case when v_stage_status = 'locked' then 'stage_locked' else 'stage_closed' end);
  end if;

  if v_question.kind = 'practical' then
    v_answer_status := case
      when exists (
        select 1 from public.code_executions e
         where e.question_id = p_question_id and e.execution_type = 'run'
           and e.outcome = 'passed' and e.code_sha256 = public.code_sha256(p_code)
      ) then 'answered'
      else 'in_progress'
    end;
  else
    v_answer_status := case when public.answer_word_count(p_answer_text) >= 10 then 'answered' else 'in_progress' end;
  end if;

  insert into public.assessment_answers as a
    (assessment_id, question_id, user_id, tier, answer_text, code, language, status)
  values (
    p_assessment_id, p_question_id, p_user_id, v_question.tier,
    case when v_question.kind = 'written' then coalesce(p_answer_text, '') end,
    case when v_question.kind = 'practical' then coalesce(p_code, '') end,
    v_question.language,
    v_answer_status
  )
  on conflict (question_id) do update
     set answer_text = excluded.answer_text,
         code = excluded.code,
         status = excluded.status,
         revision = a.revision + 1,
         saved_at = now()
   where a.status <> 'submitted'
  returning * into v_answer;
  if not found then return jsonb_build_object('result', 'answer_locked'); end if;

  return jsonb_build_object(
    'result', 'saved',
    'status', v_answer.status,
    'savedAt', v_answer.saved_at,
    'revision', v_answer.revision
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_code_execution: logs a run or a graded submission.
--   run          logged; a passing run marks identical saved code `answered`.
--   submit       only while the stage is open; locks the answer with this code.
--   auto_submit  grades the code that was locked when its stage closed.
-- At most one graded submission per question (unique index).
-- ---------------------------------------------------------------------------

create or replace function public.record_code_execution(
  p_assessment_id uuid,
  p_user_id uuid,
  p_question_id uuid,
  p_execution_type text,
  p_runtime text,
  p_outcome text,
  p_passed integer,
  p_total integer,
  p_execution_time_ms integer,
  p_code text,
  p_results jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_question record;
  v_hash text := public.code_sha256(p_code);
  v_hints integer;
  v_stage_status text;
  v_id uuid;
begin
  select q.id, q.tier, q.kind, q.language into v_question
    from public.assessment_questions q
    join public.assessments a on a.id = q.assessment_id
   where q.id = p_question_id and q.assessment_id = p_assessment_id and a.user_id = p_user_id;
  if not found or v_question.kind <> 'practical' then
    return jsonb_build_object('result', 'question_not_found');
  end if;

  if p_execution_type = 'submit' then
    if public.sync_assessment_progress(p_assessment_id, p_user_id) <> 'in_progress' then
      return jsonb_build_object('result', 'stage_closed');
    end if;
    select status into v_stage_status
      from public.assessment_stages
     where assessment_id = p_assessment_id and tier = v_question.tier;
    if v_stage_status is distinct from 'active' then
      return jsonb_build_object('result', 'stage_closed');
    end if;

    update public.assessment_answers
       set code = p_code, status = 'submitted', submitted_at = now(), saved_at = now(), revision = revision + 1
     where question_id = p_question_id and status <> 'submitted';
    if not found then
      if exists (select 1 from public.assessment_answers where question_id = p_question_id) then
        return jsonb_build_object('result', 'already_submitted');
      end if;
      insert into public.assessment_answers
        (assessment_id, question_id, user_id, tier, code, language, status, submitted_at)
      values
        (p_assessment_id, p_question_id, p_user_id, v_question.tier, p_code, v_question.language, 'submitted', now());
    end if;
  elsif p_execution_type = 'auto_submit' then
    if not exists (
      select 1 from public.assessment_answers
       where question_id = p_question_id and status = 'submitted' and public.code_sha256(code) = v_hash
    ) then
      return jsonb_build_object('result', 'answer_not_locked');
    end if;
  elsif p_execution_type <> 'run' then
    raise exception 'unknown execution type %', p_execution_type using errcode = '22023';
  end if;

  select count(*) into v_hints from public.ai_interactions where question_id = p_question_id;

  insert into public.code_executions (
    assessment_id, question_id, user_id, tier, execution_type, runtime, outcome,
    passed_tests, total_tests, execution_time_ms, code_sha256, code, results, hints_before
  )
  values (
    p_assessment_id, p_question_id, p_user_id, v_question.tier, p_execution_type, p_runtime, p_outcome,
    p_passed, p_total, p_execution_time_ms, v_hash,
    case when p_execution_type = 'run' then null else p_code end,
    coalesce(p_results, '{}'::jsonb), v_hints
  )
  on conflict (question_id) where execution_type in ('submit', 'auto_submit') do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('result', 'already_graded'); end if;

  if p_execution_type = 'run' and p_outcome = 'passed' then
    update public.assessment_answers
       set status = 'answered'
     where question_id = p_question_id and status = 'in_progress' and public.code_sha256(code) = v_hash;
  end if;

  return jsonb_build_object('result', 'recorded', 'id', v_id, 'hintsBefore', v_hints);
end;
$$;

-- ---------------------------------------------------------------------------
-- record_ai_interaction: logs an assistant exchange with its hint number and
-- the latest test result before it. Refused for questions without AI (Novice).
-- ---------------------------------------------------------------------------

create or replace function public.record_ai_interaction(
  p_assessment_id uuid,
  p_user_id uuid,
  p_question_id uuid,
  p_prompt text,
  p_response text,
  p_guardrail text,
  p_model text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_question record;
  v_hint integer;
  v_passed integer;
  v_total integer;
begin
  -- The row lock serialises hint numbering per question.
  select q.id, q.tier, q.ai_assistance into v_question
    from public.assessment_questions q
    join public.assessments a on a.id = q.assessment_id
   where q.id = p_question_id and q.assessment_id = p_assessment_id and a.user_id = p_user_id
     for update of q;
  if not found then return jsonb_build_object('result', 'question_not_found'); end if;
  if v_question.tier = 'novice' or not v_question.ai_assistance then
    return jsonb_build_object('result', 'ai_disabled');
  end if;

  select coalesce(max(hint_number), 0) + 1 into v_hint
    from public.ai_interactions where question_id = p_question_id;
  select passed_tests, total_tests into v_passed, v_total
    from public.code_executions
   where question_id = p_question_id and execution_type = 'run'
   order by created_at desc
   limit 1;

  insert into public.ai_interactions (
    assessment_id, question_id, user_id, tier, hint_number, candidate_prompt,
    assistant_response, guardrail, model, tests_passed_before, tests_total_before
  )
  values (
    p_assessment_id, p_question_id, p_user_id, v_question.tier, v_hint, p_prompt,
    p_response, p_guardrail, p_model, v_passed, v_total
  );

  return jsonb_build_object('result', 'recorded', 'hintNumber', v_hint);
end;
$$;

-- ---------------------------------------------------------------------------
-- Server only. These take a user id, so candidates must not be able to call them.
-- ---------------------------------------------------------------------------

revoke all on function public.init_assessment_stages(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.close_assessment_stage(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.open_next_assessment_stage(uuid, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.finish_assessment(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sync_assessment_progress(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_assessment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_overdue_assessments(uuid) from public, anon, authenticated;
revoke all on function public.sync_overdue_assessments() from public, anon, authenticated;
revoke all on function public.submit_assessment_stage(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.save_assessment_answer(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_code_execution(uuid, uuid, uuid, text, text, text, integer, integer, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_ai_interaction(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;

grant execute on function public.init_assessment_stages(uuid, uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.close_assessment_stage(uuid, text, timestamptz) to service_role;
grant execute on function public.open_next_assessment_stage(uuid, integer, timestamptz, timestamptz) to service_role;
grant execute on function public.finish_assessment(uuid, text, timestamptz) to service_role;
grant execute on function public.sync_assessment_progress(uuid, uuid) to service_role;
grant execute on function public.start_assessment(uuid, uuid) to service_role;
grant execute on function public.expire_overdue_assessments(uuid) to service_role;
grant execute on function public.sync_overdue_assessments() to service_role;
grant execute on function public.submit_assessment_stage(uuid, uuid, text) to service_role;
grant execute on function public.save_assessment_answer(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.record_code_execution(uuid, uuid, uuid, text, text, text, integer, integer, integer, text, jsonb) to service_role;
grant execute on function public.record_ai_interaction(uuid, uuid, uuid, text, text, text, text) to service_role;
