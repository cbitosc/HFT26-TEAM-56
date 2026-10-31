// Row shapes for the tables in supabase/migrations. Keep in sync with the SQL.

export type ResumeStatus = "uploaded" | "processing" | "analyzed" | "failed";

export type Resume = {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  extracted_text: string | null;
  analysis: Record<string, unknown> | null;
  status: ResumeStatus;
  created_at: string;
  updated_at: string;
};

export type AssessmentStatus =
  | "pending"
  | "generating"
  | "ready"
  | "in_progress"
  | "completed"
  | "expired"
  | "failed";

export type Assessment = {
  id: string;
  user_id: string;
  resume_id: string | null;
  status: AssessmentStatus;
  duration_minutes: number;
  started_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
  failure_reason: string | null;
  generation_stage: "analyzing" | "generating" | "validating" | "preparing" | null;
};

export type QuestionTier = "novice" | "adept" | "master";
export type QuestionDifficulty = "easy" | "medium" | "hard";

export type StarterFile = {
  path: string;
  content: string;
};

export type AssessmentQuestion = {
  id: string;
  assessment_id: string;
  tier: QuestionTier;
  difficulty: QuestionDifficulty;
  question_type: string;
  title: string;
  description: string;
  resume_evidence: unknown[];
  skills_tested: string[];
  starter_files: StarterFile[];
  time_allocation_minutes: number;
  display_order: number;
  created_at: string;
};

/** Server-only. Never select this into anything that reaches the client. */
export type AssessmentQuestionSecret = {
  question_id: string;
  reference_files: StarterFile[];
  hidden_tests: unknown[];
  grading_criteria: Record<string, unknown>;
  created_at: string;
};

export type AssessmentStage = {
  id: string;
  assessment_id: string;
  user_id: string;
  tier: QuestionTier;
  position: 1 | 2 | 3;
  status: "locked" | "active" | "submitted" | "expired";
  duration_minutes: number;
  started_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  created_at: string;
};

export type AssessmentAnswer = {
  id: string;
  assessment_id: string;
  question_id: string;
  user_id: string;
  tier: QuestionTier;
  answer_text: string | null;
  code: string | null;
  language: "javascript" | "typescript" | "python" | null;
  status: "in_progress" | "answered" | "submitted";
  revision: number;
  saved_at: string;
  submitted_at: string | null;
  created_at: string;
};

export type CodeExecution = {
  id: string;
  assessment_id: string;
  question_id: string;
  user_id: string;
  tier: QuestionTier;
  execution_type: "run" | "submit" | "auto_submit";
  runtime: string;
  outcome: "passed" | "failed" | "compile_error" | "runtime_error" | "timeout" | "memory_limit" | "output_limit" | "error";
  passed_tests: number;
  total_tests: number;
  execution_time_ms: number | null;
  code_sha256: string;
  code: string | null;
  /** Public test results; hidden tests only as counts. */
  results: Record<string, unknown>;
  hints_before: number;
  created_at: string;
};

export type AiInteraction = {
  id: string;
  assessment_id: string;
  question_id: string;
  user_id: string;
  tier: "adept" | "master";
  hint_number: number;
  candidate_prompt: string;
  assistant_response: string;
  guardrail: "passed" | "rewritten" | "blocked";
  model: string | null;
  tests_passed_before: number | null;
  tests_total_before: number | null;
  created_at: string;
};
