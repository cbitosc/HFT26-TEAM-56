-- Automated grading and performance reports.
-- Requires 20261031050000_stage_workflow.sql.
--
--   assessment_results   one report per assessment: status, scores and the
--                        candidate-facing breakdowns. Readable by its owner.
--   written_evaluations  the rubric (including the model answer) and the
--                        model's evaluation of each written answer, kept for
--                        audit. Server only.
--
-- Grading is claimed with a lease and fenced by the attempt number, so only
-- one worker grades an assessment at a time, a crashed worker's claim
-- expires and can be retried, and a stale worker can't overwrite a newer
-- result.

create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  user_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'grading', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_expires_at timestamptz,
  scoring_version integer,
  correctness_score numeric(5, 2) check (correctness_score between 0 and 70),
  performance_score numeric(5, 2) check (performance_score between 0 and 10),
  ai_efficiency_score numeric(5, 2) check (ai_efficiency_score between 0 and 20),
  final_score numeric(5, 2) check (final_score between 0 and 100),
  classification text
    check (classification is null or classification in ('excellent', 'strong', 'developing', 'needs_improvement')),
  -- Candidate-facing breakdowns. Never contain hidden tests, reference code or model answers.
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  score_breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(score_breakdown) = 'object'),
  stage_results jsonb not null default '[]'::jsonb check (jsonb_typeof(stage_results) = 'array'),
  question_results jsonb not null default '[]'::jsonb check (jsonb_typeof(question_results) = 'array'),
  skills_verification jsonb not null default '[]'::jsonb check (jsonb_typeof(skills_verification) = 'array'),
  ai_usage jsonb not null default '{}'::jsonb check (jsonb_typeof(ai_usage) = 'object'),
  recommendations jsonb not null default '[]'::jsonb check (jsonb_typeof(recommendations) = 'array'),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  grading_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assessment_results_assessment_fk
    foreign key (assessment_id, user_id)
    references public.assessments (id, user_id) on delete cascade,
  constraint assessment_results_assessment_key unique (assessment_id),
  -- A completed report always has every score.
  constraint assessment_results_completed_scores check (
    status <> 'completed' or (
      correctness_score is not null and performance_score is not null and ai_efficiency_score is not null
      and final_score is not null and classification is not null and completed_at is not null
      and scoring_version is not null
    )
  )
);

create index if not exists assessment_results_user_idx on public.assessment_results (user_id, created_at desc);
create index if not exists assessment_results_pending_idx
  on public.assessment_results (status, lease_expires_at)
  where status in ('pending', 'grading');

drop trigger if exists assessment_results_set_updated_at on public.assessment_results;
create trigger assessment_results_set_updated_at
  before update on public.assessment_results
  for each row execute function public.set_updated_at();

create table if not exists public.written_evaluations (
  question_id uuid primary key,
  assessment_id uuid not null,
  user_id uuid not null,
  -- The evaluation applies to exactly this answer.
  answer_sha256 text not null check (answer_sha256 ~ '^[0-9a-f]{64}$'),
  model text check (model is null or char_length(model) <= 200),
  rubric jsonb not null check (jsonb_typeof(rubric) = 'object'),
  evaluation jsonb not null check (jsonb_typeof(evaluation) = 'object'),
  score numeric(6, 2) not null check (score >= 0),
  max_score numeric(6, 2) not null check (max_score > 0 and score <= max_score),
  created_at timestamptz not null default now(),

  constraint written_evaluations_assessment_fk
    foreign key (assessment_id, user_id)
    references public.assessments (id, user_id) on delete cascade,
  constraint written_evaluations_question_fk
    foreign key (question_id, assessment_id)
    references public.assessment_questions (id, assessment_id) on delete cascade
);

alter table public.assessment_results enable row level security;
alter table public.written_evaluations enable row level security;

drop policy if exists "Users can view their own results" on public.assessment_results;
create policy "Users can view their own results"
  on public.assessment_results for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.assessment_results from anon, authenticated;
grant select on public.assessment_results to authenticated;
-- RLS with no policies and no grants: candidates can't see the audit trail
-- (it contains the rubric's model answer).
revoke all on public.written_evaluations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Finishing an assessment queues its report.
-- ---------------------------------------------------------------------------

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
  insert into public.assessment_results (assessment_id, user_id)
  select id, user_id from public.assessments
   where id = p_assessment_id and status in ('completed', 'expired')
  on conflict (assessment_id) do nothing;
$$;

-- Assessments already finished under the stage workflow get a pending report.
insert into public.assessment_results (assessment_id, user_id)
select a.id, a.user_id
  from public.assessments a
 where a.status in ('completed', 'expired')
   and exists (select 1 from public.assessment_stages s where s.assessment_id = a.id)
on conflict (assessment_id) do nothing;

-- ---------------------------------------------------------------------------
-- claim_assessment_grading: takes the grading lease. Returns
--   claimed (with the attempt number), completed, in_progress (someone else
--   holds a live lease), failed (needs an explicit retry), not_finished or
--   not_found.
-- ---------------------------------------------------------------------------

create or replace function public.claim_assessment_grading(
  p_assessment_id uuid,
  p_user_id uuid,
  p_retry boolean default false,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_result public.assessment_results;
begin
  v_status := public.sync_assessment_progress(p_assessment_id, p_user_id);
  if v_status is null then return jsonb_build_object('result', 'not_found'); end if;
  if v_status not in ('completed', 'expired') then return jsonb_build_object('result', 'not_finished'); end if;

  insert into public.assessment_results (assessment_id, user_id)
  values (p_assessment_id, p_user_id)
  on conflict (assessment_id) do nothing;

  select * into v_result from public.assessment_results where assessment_id = p_assessment_id for update;
  if v_result.status = 'completed' then return jsonb_build_object('result', 'completed'); end if;
  if v_result.status = 'grading' and v_result.lease_expires_at > now() then
    return jsonb_build_object('result', 'in_progress');
  end if;
  if v_result.status = 'failed' and not p_retry then return jsonb_build_object('result', 'failed'); end if;

  update public.assessment_results
     set status = 'grading',
         attempts = attempts + 1,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         grading_started_at = now(),
         failure_reason = null
   where id = v_result.id
  returning * into v_result;
  return jsonb_build_object('result', 'claimed', 'attempt', v_result.attempts);
end;
$$;

-- Stores the report. Only the worker holding the current attempt can complete it.
create or replace function public.complete_assessment_grading(
  p_assessment_id uuid,
  p_user_id uuid,
  p_attempt integer,
  p_report jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.assessment_results
     set status = 'completed',
         lease_expires_at = null,
         scoring_version = (p_report ->> 'scoringVersion')::integer,
         correctness_score = (p_report ->> 'correctnessScore')::numeric,
         performance_score = (p_report ->> 'performanceScore')::numeric,
         ai_efficiency_score = (p_report ->> 'aiEfficiencyScore')::numeric,
         final_score = (p_report ->> 'finalScore')::numeric,
         classification = p_report ->> 'classification',
         summary = coalesce(p_report -> 'summary', '{}'::jsonb),
         score_breakdown = coalesce(p_report -> 'scoreBreakdown', '{}'::jsonb),
         stage_results = coalesce(p_report -> 'stageResults', '[]'::jsonb),
         question_results = coalesce(p_report -> 'questionResults', '[]'::jsonb),
         skills_verification = coalesce(p_report -> 'skillsVerification', '[]'::jsonb),
         ai_usage = coalesce(p_report -> 'aiUsage', '{}'::jsonb),
         recommendations = coalesce(p_report -> 'recommendations', '[]'::jsonb),
         failure_reason = null,
         completed_at = now()
   where assessment_id = p_assessment_id
     and user_id = p_user_id
     and status = 'grading'
     and attempts = p_attempt;
  return found;
end;
$$;

create or replace function public.fail_assessment_grading(
  p_assessment_id uuid,
  p_user_id uuid,
  p_attempt integer,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.assessment_results
     set status = 'failed', lease_expires_at = null, failure_reason = left(p_reason, 500)
   where assessment_id = p_assessment_id
     and user_id = p_user_id
     and status = 'grading'
     and attempts = p_attempt;
  return found;
end;
$$;

revoke all on function public.finish_assessment(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_assessment_grading(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.complete_assessment_grading(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fail_assessment_grading(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.finish_assessment(uuid, text, timestamptz) to service_role;
grant execute on function public.claim_assessment_grading(uuid, uuid, boolean, integer) to service_role;
grant execute on function public.complete_assessment_grading(uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.fail_assessment_grading(uuid, uuid, integer, text) to service_role;
