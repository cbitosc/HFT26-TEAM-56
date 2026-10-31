import type { ResumeProfile } from "@/lib/resumes/schemas";

/** Backend engineer who claims TypeScript (sandbox-executable) and Python. */
export const typescriptProfile: ResumeProfile = {
  candidateName: "Priya Raman",
  primaryDomain: "Backend development",
  experienceLevel: "mid",
  experienceEvidence: "Software Engineer since Jan 2023 plus an internship.",
  programmingLanguages: ["Python", "TypeScript", "JavaScript", "SQL"],
  frameworksAndLibraries: ["FastAPI", "React", "Node.js", "Express"],
  databases: ["PostgreSQL", "Redis"],
  developerTools: ["Git", "Docker", "GitHub Actions", "pytest"],
  projects: [
    {
      name: "RateKeeper",
      description: "Token-bucket rate limiter shared across instances using Redis Lua scripts.",
      technologies: ["TypeScript", "Node.js", "Redis"],
      responsibilities: ["Designed the per-client bucket model", "Load tested the limiter"],
    },
    {
      name: "Orders API",
      description: "REST API for orders with pagination, filtering and an event-sourced payment ledger.",
      technologies: ["TypeScript", "Express", "PostgreSQL"],
      responsibilities: ["Built paginated list endpoints", "Implemented ledger replay"],
    },
  ],
  responsibilities: ["Designed and maintained REST APIs", "Parsed and validated query strings"],
  experience: [
    {
      role: "Software Engineer",
      organization: "Finlytics",
      period: "Jan 2023 - Present",
      highlights: ["Built REST APIs in FastAPI", "Migrated reporting jobs to workers with Redis"],
      technologies: ["FastAPI", "Redis", "PostgreSQL"],
    },
  ],
  dsaTopics: [],
  otherCompetencies: ["Performance optimisation"],
};

export const pythonOnlyProfile: ResumeProfile = {
  ...typescriptProfile,
  programmingLanguages: ["Python", "SQL"],
  frameworksAndLibraries: ["FastAPI", "Django"],
  projects: [
    {
      name: "Pathfinder",
      description: "Warehouse route planner service with a FastAPI backend and PostgreSQL storage.",
      technologies: ["Python", "FastAPI", "PostgreSQL"],
      responsibilities: ["Built the planning API"],
    },
  ],
};

export const javaOnlyProfile: ResumeProfile = {
  ...typescriptProfile,
  programmingLanguages: ["Java"],
  frameworksAndLibraries: ["Spring Boot"],
  developerTools: ["Maven"],
  projects: [
    {
      name: "Inventory Service",
      description: "Spring Boot inventory service with MySQL.",
      technologies: ["Java", "Spring Boot", "MySQL"],
      responsibilities: ["Built REST endpoints"],
    },
  ],
  experience: [],
  responsibilities: ["Built REST endpoints"],
  databases: ["MySQL"],
};
