import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResumeAnalysis } from "@/lib/resumes/schemas";
import type { Resume } from "@/types/database";

// Privileged résumé writes. Candidates can't set status, extracted_text or
// analysis themselves (see the migration), so these run with the secret key.
// Every function takes the verified user id and scopes its query to it.

const BUCKET = "resumes";
/** A claim older than this is assumed abandoned and may be retried. */
const STALE_PROCESSING_MS = 3 * 60 * 1000;

export const UPLOADS_PER_HOUR = 10;

export class StoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StoreError";
  }
}

function fail(action: string, error: { message: string }): never {
  throw new StoreError(`${action}: ${error.message}`, { cause: error });
}

export type ResumeSummary = Pick<
  Resume,
  "id" | "filename" | "status" | "created_at" | "updated_at"
>;

const SUMMARY_COLUMNS = "id, filename, status, created_at, updated_at";

export async function countRecentUploads(userId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await createAdminClient()
    .from("resumes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) fail("Count uploads", error);
  return count ?? 0;
}

async function deleteResumes(userId: string, rows: { id: string; storage_path: string }[]) {
  if (!rows.length) return;
  const admin = createAdminClient();
  // Remove the rows first: a leftover file is harmless, a row without its file isn't.
  const { error } = await admin
    .from("resumes")
    .delete()
    .eq("user_id", userId)
    .in("id", rows.map((row) => row.id));
  if (error) fail("Delete résumés", error);
  await admin.storage.from(BUCKET).remove(rows.map((row) => row.storage_path));
}

/** Drops earlier uploads that never finished analysis. */
export async function deleteUnanalyzedResumes(userId: string) {
  const { data, error } = await createAdminClient()
    .from("resumes")
    .select("id, storage_path")
    .eq("user_id", userId)
    .neq("status", "analyzed");
  if (error) fail("List unfinished résumés", error);
  await deleteResumes(userId, data ?? []);
}

/** Keeps only `keepId`: the newly analysed résumé replaces any earlier ones. */
export async function deleteOtherResumes(userId: string, keepId: string) {
  const { data, error } = await createAdminClient()
    .from("resumes")
    .select("id, storage_path")
    .eq("user_id", userId)
    .neq("id", keepId);
  if (error) fail("List previous résumés", error);
  await deleteResumes(userId, data ?? []);
}

export async function deleteResume(userId: string, resumeId: string) {
  const { data, error } = await createAdminClient()
    .from("resumes")
    .select("id, storage_path")
    .eq("user_id", userId)
    .eq("id", resumeId);
  if (error) fail("Find résumé", error);
  await deleteResumes(userId, data ?? []);
}

export async function insertResume(input: {
  id: string;
  userId: string;
  filename: string;
  storagePath: string;
  extractedText: string;
}): Promise<ResumeSummary> {
  const { data, error } = await createAdminClient()
    .from("resumes")
    .insert({
      id: input.id,
      user_id: input.userId,
      filename: input.filename,
      storage_path: input.storagePath,
      extracted_text: input.extractedText,
      status: "uploaded",
    })
    .select(SUMMARY_COLUMNS)
    .single<ResumeSummary>();
  if (error) fail("Insert résumé", error);
  return data;
}

export async function getOwnedResume(userId: string, resumeId: string) {
  const { data, error } = await createAdminClient()
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .eq("id", resumeId)
    .maybeSingle<Resume>();
  if (error) fail("Load résumé", error);
  return data;
}

/**
 * Atomically moves the résumé to `processing` so concurrent requests can't
 * analyse it twice. Returns false if someone else holds a fresh claim or it
 * is already analysed.
 */
export async function claimForAnalysis(userId: string, resumeId: string) {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data, error } = await createAdminClient()
    .from("resumes")
    .update({ status: "processing" })
    .eq("user_id", userId)
    .eq("id", resumeId)
    .or(`status.in.(uploaded,failed),and(status.eq.processing,updated_at.lt."${staleBefore}")`)
    .select("id");
  if (error) fail("Claim résumé", error);
  return (data?.length ?? 0) > 0;
}

export async function markAnalyzed(userId: string, resumeId: string, analysis: ResumeAnalysis) {
  const { error } = await createAdminClient()
    .from("resumes")
    .update({ status: "analyzed", analysis })
    .eq("user_id", userId)
    .eq("id", resumeId);
  if (error) fail("Save analysis", error);
}

export async function markFailed(userId: string, resumeId: string) {
  const { error } = await createAdminClient()
    .from("resumes")
    .update({ status: "failed" })
    .eq("user_id", userId)
    .eq("id", resumeId);
  if (error) fail("Mark résumé failed", error);
}

/** The user's most recent successfully analysed résumé. */
export async function getLatestAnalyzedResume(userId: string) {
  const { data, error } = await createAdminClient()
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "analyzed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Resume>();
  if (error) fail("Load latest résumé", error);
  return data;
}
