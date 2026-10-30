import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";

const steps = [
  {
    number: "01",
    title: "Upload your portfolio",
    body: "Your projects and technical experience become the foundation.",
  },
  {
    number: "02",
    title: "Get your personalized assessment",
    body: "AI generates challenges based on your actual skills and claimed DSA knowledge.",
  },
  {
    number: "03",
    title: "Prove what you can build",
    body: "Solve practical coding tasks and receive an objective performance report.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <Reveal>
        <h2 className="max-w-xl text-3xl font-medium tracking-[-0.04em] text-balance sm:text-4xl lg:text-5xl lg:leading-[1.1]">
          From portfolio to proof.
        </h2>
      </Reveal>
      <ol className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
        {steps.map((step) => (
          <li key={step.number}>
            <Reveal>
              <div className="border-t border-border pt-6 transition-colors duration-200 hover:border-primary/50">
                <span className="font-mono text-xs text-primary">
                  {step.number}
                </span>
                <h3 className="mt-4 text-xl font-medium tracking-[-0.03em]">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
