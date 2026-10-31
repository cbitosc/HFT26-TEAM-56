-- Profiles: one row per auth user, created automatically on first sign-in.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  provider text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile for each authenticated user.';

-- Row Level Security: users can only see and change their own row.
alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Users may edit their display details, but not the identity fields that
-- come from the OAuth provider.
revoke all on public.profiles from anon;
revoke insert, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, full_name, avatar_url) on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- Create the profile when Supabase Auth creates the user. Runs as the table
-- owner so it bypasses RLS; search_path is pinned to prevent hijacking.
-- Google sends full_name/name/picture (and avatar_url on newer projects).
-- Any of them may be missing, so every value is optional.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url, provider)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    ),
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    ),
    new.raw_app_meta_data ->> 'provider'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users who signed up before this migration.
insert into public.profiles (id, full_name, email, avatar_url, provider, created_at)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(u.raw_user_meta_data ->> 'user_name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), '')
  ),
  u.email,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(u.raw_user_meta_data ->> 'picture', '')
  ),
  u.raw_app_meta_data ->> 'provider',
  u.created_at
from auth.users u
on conflict (id) do nothing;
