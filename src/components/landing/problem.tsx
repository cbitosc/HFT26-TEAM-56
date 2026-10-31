import { Contrasts } from "@/components/landing/contrasts";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";

export function Problem() {
  return (
    <Section light="veil" padding="pt-28 pb-24 lg:pt-40 lg:pb-36">
      <Reveal>
        <p className="type-label flex items-center gap-3 text-muted-foreground">
          <span aria-hidden="true" className="h-px w-5 bg-border-strong" />
          The problem
        </p>
        <h2 className="type-display mt-6 text-[clamp(3.25rem,9vw,8rem)]">
          Coding tests measure recall.
          <span className="mt-[0.08em] block text-accent-strong">
            Not what you build.
          </span>
        </h2>
      </Reveal>

      <Contrasts className="mt-16 lg:mt-24" />
    </Section>
  );
}
