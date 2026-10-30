import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";

export function FinalCta() {
  return (
    <Section className="text-center">
      <Reveal>
        <h2 className="mx-auto max-w-3xl text-3xl font-medium tracking-[-0.04em] text-balance sm:text-4xl lg:text-5xl lg:leading-[1.1]">
          Your skills deserve more than a generic test.
        </h2>
        <p className="mt-5 text-base text-muted-foreground sm:text-[17px]">
          Show what you can actually build.
        </p>
        <div className="mt-9">
          <Button size="lg" asChild>
            <Link href="/get-started">Start your assessment</Link>
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}
