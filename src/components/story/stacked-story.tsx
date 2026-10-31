import { Reveal } from "@/components/landing/reveal";
import { SectionHeader } from "@/components/landing/section-header";
import { storySteps } from "@/components/story/story-steps";

/** The story as a plain sequence, for reduced motion and when WebGL is unavailable. */
export function StackedStory({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Reveal>
        <SectionHeader label="How it works" title="From portfolio to proof." />
      </Reveal>
      <ol className="mt-14 border-t border-border lg:mt-20">
        {storySteps.map((step) => (
          <li key={step.id} className="border-b border-border py-8 lg:py-10">
            <Reveal>
              <p className="type-label text-muted-foreground">
                <span className="text-accent-text">{step.number}</span>
                <span className="text-faint"> · </span>
                {step.title}
              </p>
              <h3 className="mt-4 text-3xl leading-tight tracking-[-0.035em] text-balance sm:text-4xl">
                {step.headline}
              </h3>
              <p className="type-lead mt-3 max-w-[32rem] text-muted-foreground">
                {step.body}
              </p>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}
