import {
  BarChart3,
  CheckCheck,
  FolderGit2,
  Shield,
  SlidersHorizontal,
  Terminal,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";

const features = [
  {
    icon: FolderGit2,
    title: "Portfolio-driven assessment generation",
    body: "Challenges are written from the projects and skills in your portfolio, not from a shared question bank.",
  },
  {
    icon: SlidersHorizontal,
    title: "Adaptive difficulty levels",
    body: "Foundation, applied, and advanced tiers follow the depth of the work you claim.",
  },
  {
    icon: Terminal,
    title: "Real-time coding environment",
    body: "Write and run solutions in the browser, in the languages your portfolio already uses.",
  },
  {
    icon: CheckCheck,
    title: "Deterministic code evaluation",
    body: "The same submission is scored the same way every time, against tests tied to the task.",
  },
  {
    icon: Shield,
    title: "Guarded AI assistance",
    body: "Help is available inside the assessment without handing you the solution.",
  },
  {
    icon: BarChart3,
    title: "Detailed performance analytics",
    body: "A report of what you proved, where you slowed down, and how the result was reached.",
  },
];

export function Features() {
  return (
    <Section id="features">
      <Reveal>
        <h2 className="max-w-xl text-3xl font-medium tracking-[-0.04em] text-balance sm:text-4xl lg:text-5xl lg:leading-[1.1]">
          Built for the work, not the template.
        </h2>
      </Reveal>
      <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <Reveal key={feature.title} className="h-full">
            <article className="h-full bg-background p-7 transition-colors duration-200 hover:bg-card sm:p-8">
              <feature.icon
                className="size-4 text-primary"
                aria-hidden="true"
                strokeWidth={1.75}
              />
              <h3 className="mt-5 text-base font-medium tracking-[-0.02em]">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {feature.body}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
