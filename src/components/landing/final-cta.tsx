import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLink } from "@/components/landing/arrow-link";
import { KineticWord } from "@/components/landing/kinetic-word";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";

export function FinalCta() {
  return (
    <Section light="horizon" padding="pt-28 pb-20 lg:pt-40 lg:pb-28">
      <Reveal>
        <p className="type-label flex items-center gap-3 text-muted-foreground">
          <span aria-hidden="true" className="h-px w-5 bg-border-strong" />
          Get started
        </p>
        <h2 className="type-display mt-6 text-[clamp(4rem,13vw,11.5rem)]">
          <span className="sr-only">Bring a project. Leave with proof.</span>
          <span aria-hidden="true" className="block">
            Bring a <KineticWord text="project." />
          </span>
          <span aria-hidden="true" className="mt-[0.06em] block text-accent-strong">
            <KineticWord text="Leave" /> with proof.
          </span>
        </h2>
        <div className="mt-12 flex flex-col gap-8 lg:mt-16 lg:flex-row lg:items-end lg:justify-between">
          <p className="type-lead max-w-[26rem] text-muted-foreground">
            Point Vetted at something you&apos;ve built and take an assessment
            written for it.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Button size="lg" className="h-11 px-6" asChild>
              <Link href="/dashboard">Start your assessment</Link>
            </Button>
            <ArrowLink href="#how-it-works">See how it works</ArrowLink>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
