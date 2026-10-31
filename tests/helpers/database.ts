import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// An in-process Postgres (PGlite) with the minimal pieces of Supabase the
// migrations depend on: the anon/authenticated/service_role roles, auth.uid()
// and the storage schema. Every migration in supabase/migrations is applied
// in order, exactly as written.

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (
    id uuid primary key, email text,
    raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant execute on function storage.foldername(text) to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to service_role;
`;

export type TestDatabase = {
  db: PGlite;
  /** Runs as the server (service role). */
  server<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs as a signed-in candidate, through RLS and column grants. */
  asUser<T = Record<string, unknown>>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) await db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));

  return {
    db,
    async server(sql, params) {
      await db.exec("set role service_role");
      try {
        return (await db.query(sql, params)).rows as never;
      } finally {
        await db.exec("reset role");
      }
    },
    async asUser(userId, sql, params) {
      await db.query("select set_config('test.uid', $1, false)", [userId]);
      await db.exec("set role authenticated");
      try {
        return (await db.query(sql, params)).rows as never;
      } finally {
        await db.exec("reset role");
        await db.exec("select set_config('test.uid', '', false)");
      }
    },
    close: () => db.close(),
  };
}

/** All migration file names, for asserting they apply cleanly twice. */
export function migrationFiles() {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
}

export function readMigration(name: string) {
  return readFileSync(new URL(name, MIGRATIONS), "utf8");
}
