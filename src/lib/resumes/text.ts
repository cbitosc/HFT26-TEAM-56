// Deterministic text handling for extracted résumé text. No AI here.

export const MIN_RESUME_CHARS = 300;
export const MIN_RESUME_WORDS = 80;
/** Below this, the PDF almost certainly has no text layer (scanned/image-only). */
export const IMAGE_ONLY_MAX_CHARS = 40;
export const MIN_TECHNICAL_SIGNALS = 3;
/** Upper bound on text sent to the model. Résumés rarely come close. */
export const MAX_AI_INPUT_CHARS = 24_000;

export function normalizeText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function countWords(text: string) {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

const TECHNICAL_TERMS = [
  // Languages
  "javascript", "typescript", "python", "java", "kotlin", "swift", "golang",
  "rust", "ruby", "php", "scala", "c++", "c#", "sql", "bash", "dart", "haskell",
  "elixir", "solidity", "matlab",
  // Frameworks and platforms
  "react", "next.js", "nextjs", "vue", "angular", "svelte", "node.js", "nodejs",
  "express", "django", "flask", "fastapi", "spring", "rails", "laravel", ".net",
  "flutter", "react native", "android", "ios", "tensorflow", "pytorch",
  "pandas", "numpy", "graphql", "tailwind",
  // Data and infrastructure
  "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "firebase",
  "supabase", "dynamodb", "elasticsearch", "kafka", "docker", "kubernetes",
  "aws", "gcp", "azure", "terraform", "linux", "ci/cd", "git", "github",
  // Practices and vocabulary
  "api", "rest", "microservices", "backend", "frontend", "full stack",
  "full-stack", "software", "developer", "engineer", "engineering",
  "programming", "algorithms", "data structures", "machine learning",
  "database", "devops", "unit test", "testing", "debugging", "deployed",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TECHNICAL_PATTERNS = TECHNICAL_TERMS.map(
  (term) =>
    // Letter/number boundaries rather than \b so "c++" and ".net" match.
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "iu"),
);

/** Number of distinct technical terms found. A cheap guard before any AI call. */
export function countTechnicalSignals(text: string) {
  return TECHNICAL_PATTERNS.filter((pattern) => pattern.test(text)).length;
}

export type TextCheck =
  | { ok: true }
  | { ok: false; code: "image_only" | "insufficient_text" | "not_technical" };

export function checkExtractedText(text: string): TextCheck {
  if (text.length <= IMAGE_ONLY_MAX_CHARS) return { ok: false, code: "image_only" };
  if (text.length < MIN_RESUME_CHARS || countWords(text) < MIN_RESUME_WORDS) {
    return { ok: false, code: "insufficient_text" };
  }
  if (countTechnicalSignals(text) < MIN_TECHNICAL_SIGNALS) {
    return { ok: false, code: "not_technical" };
  }
  return { ok: true };
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const URL_LIKE =
  /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com|gitlab\.com|twitter\.com|x\.com|t\.me|wa\.me)\/\S*/giu;
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]{7,}\d/g;

/**
 * Strips contact details before text leaves our servers. Names stay, since
 * the analysis reports the candidate's name.
 */
export function redactContactInfo(text: string) {
  return text
    .replace(EMAIL, "[email]")
    .replace(URL_LIKE, "[link]")
    .replace(PHONE_CANDIDATE, (match) => {
      const digits = match.replace(/\D/g, "");
      // Leave date ranges like "2019 - 2023" alone.
      const looksLikeYears = /^(?:\D*(?:19|20)\d{2}\D*)+$/.test(match);
      return digits.length >= 9 && !looksLikeYears ? "[phone]" : match;
    });
}

// Sentences that address the model or dictate the outcome. Résumés don't
// legitimately contain these, so they're dropped before the model sees them
// (and before grounding, so injected skills can't be "found" in the text).
const INSTRUCTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override)\b[^.!?\n]{0,60}\b(?:instructions?|prompts?|rules|guidelines|previous|prior|above|system)\b/i,
  /\b(?:mark|rate|rank|classify|label|treat|score|consider|evaluate|grade)\b[^.!?\n]{0,40}\b(?:this|the)\s+(?:candidate|applicant|résumé|resume|cv|document|person)\s+(?:as|is|should|deserves|a|an|with|\d)/i,
  /\b(?:you are|act as|pretend to be|from now on)\b[^.!?\n]{0,40}\b(?:ai|model|assistant|gpt|llm|chatbot|recruiter|screener|evaluator)\b/i,
  /\b(?:respond|reply|answer|output)\b[^.!?\n]{0,30}\b(?:only|with|in)\b[^.!?\n]{0,30}\b(?:json|yes|true|valid)\b/i,
];

export function stripInstructionLines(text: string) {
  let removed = 0;
  const lines = text.split("\n").flatMap((line) => {
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((sentence) => {
      const hit = INSTRUCTION_PATTERNS.some((pattern) => pattern.test(sentence));
      if (hit) removed++;
      return !hit;
    });
    if (kept.length === sentences.length) return [line];
    return kept.length ? [kept.join(" ")] : [];
  });
  return { text: lines.join("\n"), removed };
}

/** Lowercase alphanumerics plus + and #, for lenient "is this in the text" checks. */
export function compactForMatch(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}+#]/gu, "");
}
