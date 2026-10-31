import type { NextRequest } from "next/server";
import { apiError, json, requireUser } from "@/lib/api/http";
import { RESUME_ERROR_MESSAGES as MESSAGES } from "@/lib/resumes/messages";
import { resumeAnalysisSchema } from "@/lib/resumes/schemas";
import { createClient } from "@/lib/supabase/server";
import type { Resume } from "@/types/database";

/**
 * GET /api/resumes/current
 * The signed-in user's latest résumé and its analysis, or `{ resume: null }`.
 * Reads through RLS with the user's own session.
 */
export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resumes")
    .select("id, filename, status, analysis, created_at, updated_at")
    .eq("user_id", guard.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Omit<Resume, "user_id" | "storage_path" | "extracted_text">>();

  if (error) {
    console.error("[resumes] load current failed", error);
    return apiError(500, "server_error", MESSAGES.server_error, true);
  }
  if (!data) return json({ resume: null });

  const analysis = resumeAnalysisSchema.safeParse(data.analysis);
  return json({
    resume: { ...data, analysis: analysis.success ? analysis.data : null },
  });
}
