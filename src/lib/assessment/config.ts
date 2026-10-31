// The fixed shape of every Vetted assessment: 12 questions, three tiers of
// four, 60 minutes (Novice 15, Adept 20, Master 25). Generation, validation
// and the stage timers read from here; the stage minutes are mirrored in
// public.assessment_stage_minutes (supabase/migrations).

export const TIERS = ["novice", "adept", "master"] as const;
export type Tier = (typeof TIERS)[number];

export const WRITTEN_TYPES = ["theory", "situational", "architecture", "problem_solving"] as const;
export type WrittenType = (typeof WRITTEN_TYPES)[number];

export const PRACTICAL_TYPES = ["coding", "debugging"] as const;
export type PracticalType = (typeof PRACTICAL_TYPES)[number];

export type QuestionType = WrittenType | PracticalType;
export type Difficulty = "easy" | "medium" | "hard";

export const QUESTIONS_PER_TIER = 4;
export const ASSESSMENT_MINUTES = 60;

/** Where a `generating` assessment is, as recorded in assessments.generation_stage. */
export const GENERATION_STAGES = ["analyzing", "generating", "validating", "preparing"] as const;
export type GenerationStage = (typeof GENERATION_STAGES)[number];

type TierConfig = {
  label: string;
  difficulty: Difficulty;
  minutes: number;
  aiAssistance: boolean;
  /** Exact number of written questions of each type. */
  written: Partial<Record<WrittenType, number>>;
  /** Exact number of practical questions, and which practical types are allowed. */
  practical: number;
  practicalTypes: readonly PracticalType[];
  /** What the tier is for, used in prompts. */
  focus: string;
};

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  novice: {
    label: "Novice",
    difficulty: "easy",
    minutes: 15,
    aiAssistance: false,
    written: { theory: 3 },
    practical: 1,
    practicalTypes: ["coding"],
    focus:
      "foundational knowledge of the technologies and concepts the candidate claims: core language features, basic framework usage, and fundamentals they would use daily",
  },
  adept: {
    label: "Adept",
    difficulty: "medium",
    minutes: 20,
    aiAssistance: true,
    written: { theory: 1, situational: 1 },
    practical: 2,
    practicalTypes: ["coding", "debugging"],
    focus:
      "applying the claimed skills to realistic scenarios drawn from the candidate's projects and roles: implementing features, handling edge cases, and fixing realistic bugs",
  },
  master: {
    label: "Master",
    difficulty: "hard",
    minutes: 25,
    aiAssistance: true,
    written: { architecture: 1, problem_solving: 1 },
    practical: 2,
    practicalTypes: ["coding", "debugging"],
    focus:
      "deep understanding of the claimed technologies, projects and responsibilities: non-trivial logic with subtle edge cases, architecture and troubleshooting trade-offs, and end-to-end problem solving",
  },
};

/** How many questions of each kind an attempt must produce. */
export type SlotNeed = {
  written: Partial<Record<WrittenType, number>>;
  practical: number;
};

export function fullTierNeed(tier: Tier, practical: number): SlotNeed {
  return { written: { ...TIER_CONFIG[tier].written }, practical };
}

export function totalNeeded(need: SlotNeed) {
  return need.practical + Object.values(need.written).reduce((sum, n) => sum + (n ?? 0), 0);
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  theory: "Theory",
  situational: "Situational",
  architecture: "Architecture / troubleshooting",
  problem_solving: "Problem solving",
  coding: "Coding",
  debugging: "Debugging",
};

/** Languages whose AI-generated code can be validated in the sandbox. */
export const SANDBOX_LANGUAGES = ["typescript", "javascript"] as const;
/** Languages with prevalidated challenge templates. */
export const TEMPLATE_LANGUAGES = ["typescript", "javascript", "python"] as const;
export type CodeLanguage = (typeof TEMPLATE_LANGUAGES)[number];

export const LANGUAGE_LABEL: Record<CodeLanguage, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
};

export const LANGUAGE_FILE: Record<CodeLanguage, string> = {
  typescript: "solution.ts",
  javascript: "solution.js",
  python: "solution.py",
};
