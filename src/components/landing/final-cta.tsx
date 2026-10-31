import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";
import { SectionHeader } from "@/components/landing/section-header";

export function FinalCta() {
  return (
    <Section light="horizon" padding="pt-24 pb-28 lg:pt-32 lg:pb-40">
      <Reveal>
        <SectionHeader
          label="Get started"
          size="xl"
          align="center"
          title="Bring a project. Leave with a result you can show."
          description="Point Vetted at something you've built and take an assessment written for it."
        />
        <div className="mt-10 flex justify-center">
          <Button size="lg" asChild>
            <Link href="/dashboard">Start your assessment</Link>
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}
