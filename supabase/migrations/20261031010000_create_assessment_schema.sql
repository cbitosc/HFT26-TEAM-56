-- Résumés, assessments and their questions, plus the private `resumes`
-- storage bucket.
--
-- Access model:
--   * Candidates read their own rows through RLS with the publishable key.
--   * Candidates may create a résumé row (and its file) for themselves.
--   * Everything derived by the platform (analysis, assessments, questions,
--     timing) is written only by trusted server code with the secret key,
--     which bypasses RLS. Candidates can't forge results or extend a timer.
--   * assessment_question_secrets is never exposed to anon/authenticated.

-- Shared trigger: keep updated_at current on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  filename text not null
    check (char_length(filename) between 1 and 255),
  storage_path text not null unique,
  extracted_text text,
  analysis jsonb,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'analyzed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Files live at `<user_id>/<resume_id>.pdf` in the resumes bucket.
  constraint resumes_storage_path_format
    check (storage_path = user_id::text || '/' || id::text || '.pdf'),
  constraint resumes_analysis_is_object
    check (analysis is null or jsonb_typeof(analysis) = 'object'),
  -- Target for the composite foreign key on assessments.
  constraint resumes_id_user_id_key unique (id, user_id)
);

create index if not exists resumes_user_id_created_at_idx
  on public.resumes (user_id, created_at desc);

drop trigger if exists resumes_set_updated_at on public.resumes;
create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

alter table public.resumes enable row level security;

drop policy if exists "Users can view their own resumes" on public.resumes;
create policy "Users can view their own resumes"
  on public.resumes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own resumes" on public.resumes;
create policy "Users can create their own resumes"
  on public.resumes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can rename their own resumes" on public.resumes;
create policy "Users can rename their own resumes"
  on public.resumes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own resumes" on public.resumes;
create policy "Users can delete their own resumes"
  on public.resumes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Candidates supply the file metadata; status, extracted_text and analysis
-- are written by the server only.
revoke all on public.resumes from anon, authenticated;
grant select, delete on public.resumes to authenticated;
grant insert (id, user_id, filename, storage_path) on public.resumes to authenticated;
grant update (filename) on public.resumes to authenticated;

-- ---------------------------------------------------------------------------
-- assessments
-- ---------------------------------------------------------------------------

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid,
  status text not null default 'pending'
    check (status in (
      'pending', 'generating', 'ready', 'in_progress',
      'completed', 'expired', 'failed'
    )),
  duration_minutes integer not null
    check (duration_minutes between 1 and 480),
  started_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  -- The résumé must belong to the same candidate. Deleting the résumé keeps
  -- the assessment history and clears the link.
  constraint assessments_resume_fk
    foreign key (resume_id, user_id)
    references public.resumes (id, user_id)
    on delete set null (resume_id),
  constraint assessments_expires_after_start
    check (expires_at is null or (started_at is not null and expires_at > started_at)),
  constraint assessments_completed_after_start
    check (completed_at is null or (started_at is not null and completed_at >= started_at)),
  constraint assessments_started_when_running
    check (status not in ('in_progress', 'completed') or started_at is not null),
  constraint assessments_completed_when_done
    check (status <> 'completed' or completed_at is not null)
);

create index if not exists assessments_user_id_created_at_idx
  on public.assessments (user_id, created_at desc);
create index if not exists assessments_resume_id_idx
  on public.assessments (resume_id);

alter table public.assessments enable row level security;

drop policy if exists "Users can view their own assessments" on public.assessments;
create policy "Users can view their own assessments"
  on public.assessments for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Read-only for candidates: creation, start, expiry and completion go
-- through the server so timing can't be tampered with.
revoke all on public.assessments from anon, authenticated;
grant select on public.assessments to authenticated;

-- ---------------------------------------------------------------------------
-- assessment_questions (candidate-visible part of each question)
-- ---------------------------------------------------------------------------

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null
    references public.assessments (id) on delete cascade,
  tier text not null
    check (tier in ('foundation', 'applied', 'advanced')),
  difficulty text not null
    check (difficulty in ('easy', 'medium', 'hard')),
  question_type text not null
    check (question_type ~ '^[a-z][a-z_]{1,39}$'),
  title text not null
    check (char_length(title) between 1 and 200),
  description text not null,
  resume_evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(resume_evidence) = 'array'),
  skills_tested jsonb not null default '[]'::jsonb
    check (jsonb_typeof(skills_tested) = 'array'),
  starter_files jsonb not null default '[]'::jsonb
    check (jsonb_typeof(starter_files) = 'array'),
  time_allocation_minutes integer not null
    check (time_allocation_minutes between 1 and 480),
  display_order integer not null
    check (display_order >= 0),
  created_at timestamptz not null default now(),

  constraint assessment_questions_order_key
    unique (assessment_id, display_order)
);

alter table public.assessment_questions enable row level security;

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
    )
  );

revoke all on public.assessment_questions from anon, authenticated;
grant select on public.assessment_questions to authenticated;

-- ---------------------------------------------------------------------------
-- assessment_question_secrets (server only)
-- ---------------------------------------------------------------------------

create table if not exists public.assessment_question_secrets (
  question_id uuid primary key
    references public.assessment_questions (id) on delete cascade,
  reference_files jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reference_files) = 'array'),
  hidden_tests jsonb not null default '[]'::jsonb
    check (jsonb_typeof(hidden_tests) = 'array'),
  grading_criteria jsonb not null default '{}'::jsonb
    check (jsonb_typeof(grading_criteria) = 'object'),
  created_at timestamptz not null default now()
);

-- RLS on with no policies, and no table privileges: anon and authenticated
-- can't see this table at all. Only the service role (secret key) can.
alter table public.assessment_question_secrets enable row level security;
revoke all on public.assessment_question_secrets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private `resumes` bucket, files at `<user_id>/<resume_id>.pdf`
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first folder must be the caller's user id and the file name a UUID
-- with a .pdf extension.
drop policy if exists "Users can upload their own resumes" on storage.objects;
create policy "Users can upload their own resumes"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  );

drop policy if exists "Users can read their own resumes" on storage.objects;
create policy "Users can read their own resumes"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can replace their own resumes" on storage.objects;
create policy "Users can replace their own resumes"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  );

drop policy if exists "Users can delete their own resumes" on storage.objects;
create policy "Users can delete their own resumes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
