import { HowItWorksStory } from "@/components/landing/how-it-works-story";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";
import { SectionHeader } from "@/components/landing/section-header";

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      light="band"
      padding="pt-24 pb-24 lg:pt-28 story:pb-0"
    >
      <Reveal>
        <SectionHeader
          label="How it works"
          title="From portfolio to proof."
          description="One project, traced end to end. Vetted reads Leila's pathfinder repository, writes a challenge from what it finds, and scores her solution."
        />
      </Reveal>
      <HowItWorksStory />
    </Section>
  );
}
