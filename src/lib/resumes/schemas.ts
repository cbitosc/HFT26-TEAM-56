import { z } from "zod";

// Schemas sent to the model as JSON Schema (strict structured output) and
// used to validate its reply. Keep them free of transforms and length
// constraints, which strict mode can't express; limits are applied in code.

export const resumeValidationSchema = z.object({
  isResume: z.boolean(),
  isTechnicalResume: z.boolean(),
  hasSufficientInformation: z.boolean(),
  reason: z.string(),
});

export type ResumeValidation = z.infer<typeof resumeValidationSchema>;

export const EXPERIENCE_LEVELS = [
  "student",
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "unknown",
] as const;

export const resumeProfileSchema = z.object({
  candidateName: z.string().nullable(),
  primaryDomain: z.string(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  experienceEvidence: z.string(),
  programmingLanguages: z.array(z.string()),
  frameworksAndLibraries: z.array(z.string()),
  databases: z.array(z.string()),
  developerTools: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      technologies: z.array(z.string()),
      responsibilities: z.array(z.string()),
    }),
  ),
  responsibilities: z.array(z.string()),
  experience: z.array(
    z.object({
      role: z.string(),
      organization: z.string().nullable(),
      period: z.string().nullable(),
      highlights: z.array(z.string()),
      technologies: z.array(z.string()),
    }),
  ),
  dsaTopics: z.array(z.string()),
  otherCompetencies: z.array(z.string()),
});

export type ResumeProfile = z.infer<typeof resumeProfileSchema>;

/** Shape stored in resumes.analysis. Bump `version` on breaking changes. */
export const resumeAnalysisSchema = z.object({
  version: z.literal(1),
  model: z.string(),
  analyzedAt: z.string(),
  validation: resumeValidationSchema,
  profile: resumeProfileSchema,
});

export type ResumeAnalysis = z.infer<typeof resumeAnalysisSchema>;
