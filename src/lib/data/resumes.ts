import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { resumeAnalysisSchema, type ResumeAnalysis } from "@/lib/resumes/schemas";
import { createClient } from "@/lib/supabase/server";

export type AnalyzedResume = {
  id: string;
  filename: string;
  createdAt: string;
  analysis: ResumeAnalysis;
};

/**
 * The signed-in user's latest successfully analysed résumé, or null.
 * Rows whose analysis doesn't match the current schema are treated as absent.
 */
export const getCurrentResume = cache(async (): Promise<AnalyzedResume | null> => {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("resumes")
    .select("id, filename, analysis, created_at")
    .eq("user_id", user.id)
    .eq("status", "analyzed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; filename: string; analysis: unknown; created_at: string }>();

  if (error) throw new Error(`Failed to load résumé: ${error.message}`);
  if (!data) return null;

  const analysis = resumeAnalysisSchema.safeParse(data.analysis);
  if (!analysis.success) return null;

  return {
    id: data.id,
    filename: data.filename,
    createdAt: data.created_at,
    analysis: analysis.data,
  };
});

/** Matches the server's claim timeout: a `processing` row older than this was abandoned. */
const ANALYSIS_STALE_MS = 3 * 60 * 1000;

export type PendingResume = {
  id: string;
  filename: string;
  /** `analyzing` while a fresh claim is held; `needs_retry` when uploaded but not (or not successfully) analysed. */
  state: "analyzing" | "needs_retry";
};

/**
 * The user's newest upload that hasn't been analysed yet, if it's newer than
 * their analysed résumé. Lets the dashboard resume where a refresh left off.
 */
export const getPendingResume = cache(async (): Promise<PendingResume | null> => {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("resumes")
    .select("id, filename, status, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; filename: string; status: string; updated_at: string }>();

  if (error) throw new Error(`Failed to load résumé: ${error.message}`);
  if (!data || data.status === "analyzed") return null;

  const fresh = Date.now() - new Date(data.updated_at).getTime() < ANALYSIS_STALE_MS;
  return {
    id: data.id,
    filename: data.filename,
    state: data.status === "processing" && fresh ? "analyzing" : "needs_retry",
  };
});
