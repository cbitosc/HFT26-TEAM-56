import type { ReactNode } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { formatDate } from "@/components/dashboard/assessment-list";
import { GenerateAssessmentButton } from "@/components/dashboard/generate-assessment-button";
import { PageHeader, SectionHeading } from "@/components/dashboard/page-header";
import { ReplaceResume } from "@/components/dashboard/replace-resume";
import { ChipList } from "@/components/ui/chip";
import { StatusIndicator } from "@/components/ui/status";
import { ASSESSMENT_MINUTES, QUESTIONS_PER_TIER, TIERS, TIER_CONFIG } from "@/lib/assessment/config";
import type { AnalyzedResume } from "@/lib/data/resumes";
import type { ResumeProfile } from "@/lib/resumes/schemas";
import { cn } from "@/lib/utils";

const LEVEL_LABEL: Record<ResumeProfile["experienceLevel"], string> = {
  student: "Student",
  entry: "Entry level",
  junior: "Junior",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead",
  unknown: "Not stated",
};

/**
 * The analysis records tools and other competencies in two broad lists.
 * For reading, cloud and infrastructure entries from those lists get their
 * own group; nothing is added or renamed.
 */
const CLOUD_PATTERN =
  /\b(aws|amazon web services|azure|gcp|google cloud|docker|kubernetes|k8s|terraform|pulumi|ansible|helm|vercel|netlify|heroku|cloudflare|digitalocean|railway|fly\.io|lambda|ec2|s3|cloud ?run|serverless|nginx|linux|ci ?\/ ?cd|github actions|gitlab ci|jenkins|circleci|argo ?cd|devops|prometheus|grafana|datadog|openshift|cloud)\b/i;

function skillGroups(profile: ResumeProfile) {
  const tools = [...profile.developerTools, ...profile.otherCompetencies];
  const cloud = tools.filter((item) => CLOUD_PATTERN.test(item));
  return [
    { label: "Programming languages", items: profile.programmingLanguages },
    { label: "Frameworks & libraries", items: profile.frameworksAndLibraries },
    { label: "Databases", items: profile.databases },
    { label: "Cloud & infrastructure", items: cloud },
    { label: "Development tools", items: profile.developerTools.filter((item) => !cloud.includes(item)) },
    { label: "Other technical competencies", items: profile.otherCompetencies.filter((item) => !cloud.includes(item)) },
  ].filter((group) => group.items.length > 0);
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">{children}</p>;
}

type ResumeOverviewProps = {
  resume: AnalyzedResume;
  /** The signed-in account's name: the greeting, and the fallback when the résumé doesn't state one. */
  accountName: string;
  /** The latest assessment's status panel; without one, offers to generate. */
  assessmentPanel?: ReactNode;
};

export function ResumeOverview({ resume, accountName, assessmentPanel }: ResumeOverviewProps) {
  const { profile } = resume.analysis;
  const name = profile.candidateName ?? accountName;
  const groups = skillGroups(profile);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${accountName.split(" ")[0]}`}
        description="Your résumé analysis and what to do next."
        actions={<ReplaceResume key={resume.id} />}
      />

      <CandidateSummary resume={resume} name={name} />

      <section aria-label="Assessment">{assessmentPanel ?? <ReadyToGenerate resumeId={resume.id} />}</section>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-8">
          <Projects projects={profile.projects} />
          <Experience profile={profile} />
        </div>

        <div className="min-w-0 space-y-8">
          <section aria-labelledby="skills-heading">
            <SectionHeading id="skills-heading" title="Technical skills" meta={groups.reduce((sum, g) => sum + g.items.length, 0) || undefined} />
            <div className="mt-3">
              {groups.length ? (
                <dl className="divide-y divide-border rounded-lg border border-border bg-card">
                  {groups.map((group) => (
                    <div key={group.label} className="px-4 py-3">
                      <dt className="text-xs text-muted-foreground">{group.label}</dt>
                      <dd className="mt-2">
                        <ChipList items={group.items} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <Empty>No specific technologies were listed.</Empty>
              )}
            </div>
          </section>

          <section aria-labelledby="dsa-heading">
            <SectionHeading id="dsa-heading" title="Data structures & algorithms" />
            <div className="mt-3">
              {profile.dsaTopics.length ? (
                <ChipList items={profile.dsaTopics} />
              ) : (
                <p className="text-[13px] text-muted-foreground">No topics are mentioned explicitly.</p>
              )}
            </div>
          </section>

          {profile.responsibilities.length ? (
            <section aria-labelledby="responsibilities-heading">
              <SectionHeading id="responsibilities-heading" title="Claimed responsibilities" meta={profile.responsibilities.length} />
              <ul className="mt-3 space-y-1.5 text-[13px] leading-5 text-muted-foreground">
                {profile.responsibilities.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-border-strong" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Who the résumé describes, at a glance. */
function CandidateSummary({ resume, name }: { resume: AnalyzedResume; name: string }) {
  const { profile, analyzedAt } = resume.analysis;
  const items: { label: string; value: ReactNode; detail?: ReactNode }[] = [
    { label: "Candidate", value: name },
    { label: "Primary domain", value: profile.primaryDomain },
    { label: "Experience level", value: LEVEL_LABEL[profile.experienceLevel] },
    {
      label: "Résumé",
      value: (
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
          <span className="truncate">{resume.filename}</span>
        </span>
      ),
      detail: <StatusIndicator tone="accent">Analysed {formatDate(analyzedAt)}</StatusIndicator>,
    },
  ];

  return (
    <dl className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "min-w-0 border-border px-4 py-3.5",
            index > 0 && "border-t",
            index === 1 && "sm:border-t-0 sm:border-l",
            index === 3 && "sm:border-l",
            index >= 2 && "xl:border-t-0 xl:border-l",
          )}
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 truncate text-sm text-foreground">{item.value}</dd>
          {item.detail ? <dd className="mt-1">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Assessment readiness when no assessment exists for this résumé yet. */
function ReadyToGenerate({ resumeId }: { resumeId: string }) {
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <StatusIndicator tone="accent">Résumé analysed</StatusIndicator>
        <h2 className="mt-2 text-base font-medium tracking-[-0.02em] text-foreground">Ready for your assessment</h2>
        <p className="mt-1 max-w-xl text-[13px] leading-5 text-muted-foreground">
          {TIERS.length * QUESTIONS_PER_TIER} questions written from the projects and skills above, in {TIERS.length} timed
          stages totalling {ASSESSMENT_MINUTES} minutes. The timer starts only when you begin.
        </p>
        <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground" aria-label="Stages">
          {TIERS.map((tier, index) => (
            <li key={tier} className="flex items-center gap-1.5">
              {index > 0 ? <ChevronRight className="size-3 text-faint" aria-hidden="true" /> : null}
              <span className="text-foreground/85">{TIER_CONFIG[tier].label}</span>
              <span className="text-faint tabular-nums">{TIER_CONFIG[tier].minutes} min</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="shrink-0">
        <GenerateAssessmentButton resumeId={resumeId} />
      </div>
    </div>
  );
}

function Projects({ projects }: { projects: ResumeProfile["projects"] }) {
  return (
    <section aria-labelledby="projects-heading">
      <SectionHeading id="projects-heading" title="Projects" meta={projects.length || undefined} />
      <div className="mt-3">
        {projects.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {projects.map((project, index) => (
              <li key={`${project.name}-${index}`} className="px-4 py-4">
                <p className="text-sm font-medium text-foreground">{project.name}</p>
                {project.description ? (
                  <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{project.description}</p>
                ) : null}
                {project.technologies.length ? (
                  <ChipList items={project.technologies} label={`Technologies used in ${project.name}`} className="mt-3" />
                ) : null}
                {project.responsibilities.length ? (
                  <details className="group mt-3">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" aria-hidden="true" />
                      {project.responsibilities.length} claimed{" "}
                      {project.responsibilities.length === 1 ? "contribution" : "contributions"}
                    </summary>
                    <ul className="mt-2 space-y-1.5 pl-[18px] text-[13px] leading-5 text-foreground/85">
                      {project.responsibilities.map((item) => (
                        <li key={item} className="flex gap-2.5">
                          <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-border-strong" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No projects were described in your résumé.</Empty>
        )}
      </div>
    </section>
  );
}

function Experience({ profile }: { profile: ResumeProfile }) {
  const roles = profile.experience;
  return (
    <section aria-labelledby="experience-heading">
      <SectionHeading id="experience-heading" title="Professional experience" meta={roles.length || undefined} />
      <div className="mt-3">
        {roles.length ? (
          <ol className="relative space-y-6 border-l border-border pl-5">
            {roles.map((role, index) => (
              <li key={`${role.role}-${index}`} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 -left-[24.5px] size-2 rounded-full border border-border-strong bg-background"
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {role.role}
                    {role.organization ? (
                      <span className="font-normal text-muted-foreground"> · {role.organization}</span>
                    ) : null}
                  </p>
                  {role.period ? <p className="text-xs text-faint tabular-nums">{role.period}</p> : null}
                </div>
                {role.highlights.length ? (
                  <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-muted-foreground">
                    {role.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-border-strong" />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {role.technologies.length ? (
                  <ChipList items={role.technologies} label={`Technologies used as ${role.role}`} className="mt-3" />
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <Empty>No professional experience was listed.</Empty>
        )}
        {profile.experienceEvidence ? (
          <p className="mt-4 text-xs leading-5 text-faint">{profile.experienceEvidence}</p>
        ) : null}
      </div>
    </section>
  );
}
