import "server-only";
import { ASSESSMENT_MINUTES, TIER_CONFIG, TIERS, type GenerationStage, type Tier } from "@/lib/assessment/config";
import {
  STALE_GENERATION_MS,
  getAssessmentStructure,
  type AssessmentRow,
} from "@/lib/assessment/store";
import { createClient } from "@/lib/supabase/server";

// Candidate-facing view of an assessment. Built only from public columns;
// assessment_question_secrets is never queried here.

export const PUBLIC_QUESTION_COLUMNS =
  "id, tier, difficulty, kind, question_type, title, description, resume_evidence, skills_tested, time_allocation_minutes, display_order, language, entry_point, starter_files, example_tests, ai_assistance";

export type PublicQuestion = {
  id: string;
  tier: Tier;
  difficulty: string;
  kind: "practical" | "written";
  type: string;
  title: string;
  statement: string;
  resumeEvidence: string[];
  skillsTested: string[];
  timeMinutes: number;
  order: number;
  language: string | null;
  entryPoint: string | null;
  starterFiles: { path: string; content: string }[];
  exampleTests: { name: string; args: unknown[]; expected: unknown; expectThrows: boolean }[];
  aiAssistance: boolean;
};

export type QuestionOutline = {
  tier: Tier;
  kind: "practical" | "written";
  type: string;
  language: string | null;
  timeMinutes: number;
  order: number;
};

export type PublicAssessment = {
  id: string;
  status: AssessmentRow["status"];
  durationMinutes: number;
  createdAt: string;
  startedAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  /** Set while generating. */
  generationStage: GenerationStage | null;
  questionCount: number;
  resumeFilename: string | null;
  technicalDomain: string | null;
  tiers: {
    tier: Tier;
    label: string;
    difficulty: string;
    minutes: number;
    aiAssistance: boolean;
    /** Full questions once started; outlines (no content) before that. */
    questions: PublicQuestion[] | QuestionOutline[];
  }[];
  contentVisible: boolean;
};

const CONTENT_VISIBLE = new Set(["in_progress", "completed", "expired"]);

export type QuestionRow = {
  id: string;
  tier: Tier;
  difficulty: string;
  kind: "practical" | "written";
  question_type: string;
  title: string;
  description: string;
  resume_evidence: string[];
  skills_tested: string[];
  time_allocation_minutes: number;
  display_order: number;
  language: string | null;
  entry_point: string | null;
  starter_files: { path: string; content: string }[];
  example_tests: PublicQuestion["exampleTests"];
  ai_assistance: boolean;
};

export function toPublicQuestion(q: QuestionRow): PublicQuestion {
  return {
    id: q.id,
    tier: q.tier,
    difficulty: q.difficulty,
    kind: q.kind,
    type: q.question_type,
    title: q.title,
    statement: q.description,
    resumeEvidence: q.resume_evidence,
    skillsTested: q.skills_tested,
    timeMinutes: q.time_allocation_minutes,
    order: q.display_order,
    language: q.language,
    entryPoint: q.entry_point,
    starterFiles: q.starter_files,
    exampleTests: q.example_tests,
    aiAssistance: q.ai_assistance,
  };
}

export async function toPublicAssessment(row: AssessmentRow): Promise<PublicAssessment> {
  const isStale = row.status === "generating" && Date.now() - new Date(row.created_at).getTime() > STALE_GENERATION_MS;
  // Past the deadline counts as expired even before the row is updated.
  const isOverdue = row.status === "in_progress" && !!row.expires_at && Date.now() >= new Date(row.expires_at).getTime();
  const status = isStale ? "failed" : isOverdue ? "expired" : row.status;
  const contentVisible = CONTENT_VISIBLE.has(status);

  let byTier = new Map<Tier, PublicQuestion[] | QuestionOutline[]>();
  if (contentVisible) {
    // Read through RLS with the candidate's own session.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("assessment_questions")
      .select(PUBLIC_QUESTION_COLUMNS)
      .eq("assessment_id", row.id)
      .order("display_order")
      .returns<QuestionRow[]>();
    if (error) throw new Error(`Load questions: ${error.message}`);
    const questions = (data ?? []).map(toPublicQuestion);
    byTier = new Map(TIERS.map((tier) => [tier, questions.filter((q) => q.tier === tier)]));
  } else if (status === "ready") {
    const outline: QuestionOutline[] = (await getAssessmentStructure(row.id)).map((q) => ({
      tier: q.tier as Tier,
      kind: q.kind as QuestionOutline["kind"],
      type: q.question_type,
      language: q.language,
      timeMinutes: q.time_allocation_minutes,
      order: q.display_order,
    }));
    byTier = new Map(TIERS.map((tier) => [tier, outline.filter((q) => q.tier === tier)]));
  }

  return {
    id: row.id,
    status,
    // Starting sets the 60 minute schedule, also for assessments generated earlier.
    durationMinutes: row.started_at ? row.duration_minutes : ASSESSMENT_MINUTES,
    createdAt: row.created_at,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    failureReason: isStale ? "Generation took too long and was stopped." : row.failure_reason,
    generationStage: status === "generating" ? row.generation_stage : null,
    resumeFilename: row.resume_filename,
    technicalDomain: row.technical_domain,
    questionCount: [...byTier.values()].reduce((sum, questions) => sum + questions.length, 0),
    contentVisible,
    tiers: TIERS.map((tier) => {
      const questions = byTier.get(tier) ?? [];
      return {
        tier,
        label: TIER_CONFIG[tier].label,
        difficulty: TIER_CONFIG[tier].difficulty,
        // Each stage has its own fixed countdown.
        minutes: TIER_CONFIG[tier].minutes,
        aiAssistance: TIER_CONFIG[tier].aiAssistance,
        questions,
      };
    }),
  };
}
