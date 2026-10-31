import { timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { apiError, json } from "@/lib/api/http";
import { findPendingGradings, gradeAssessment } from "@/lib/grading/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * GET /api/cron/assessments   Authorization: Bearer $CRON_SECRET
 * Scheduled sweep: closes stages and assessments whose deadlines passed,
 * even if the candidate never comes back, then grades finished assessments
 * that are waiting or whose grading worker died (a few per run).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return apiError(503, "not_configured", "Set CRON_SECRET to enable the sweep.");
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return apiError(401, "unauthorized", "Unauthorized.");
  }

  const { data, error } = await createAdminClient().rpc("sync_overdue_assessments");
  if (error) {
    console.error("[cron] assessment sweep failed", error);
    return apiError(500, "server_error", "Sweep failed.", true);
  }
  const pending = await findPendingGradings(3).catch((sweepError) => {
    console.error("[cron] pending gradings lookup failed", sweepError);
    return [];
  });
  after(async () => {
    for (const item of pending) await gradeAssessment(item.user_id, item.assessment_id);
  });
  return json({ synced: data as number, grading: pending.length });
}
