import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLink } from "@/components/landing/arrow-link";
import { Container } from "@/components/landing/container";
import { HeroOrb } from "@/components/landing/hero-orb";
import { KineticWord } from "@/components/landing/kinetic-word";
import { HeroHandoff } from "@/components/story/hero-handoff";

/** What a portfolio can be assessed on, run along the bottom of the hero. */
const topics = [
  "TypeScript",
  "Python",
  "Go",
  "React",
  "Node.js",
  "SQL",
  "Graphs",
  "Dynamic programming",
  "System design",
  "Concurrency",
] as const;

export function Hero() {
  return (
    <section aria-labelledby="hero-title">
      <Container className="pt-20 sm:pt-28 lg:pt-32">
        <h1
          id="hero-title"
          className="hero-rise text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] font-medium tracking-[-0.045em] text-balance"
        >
          Your portfolio tells a story.{" "}
          <br className="hidden sm:block" />
          Let&apos;s put it to the test.
        </h1>
        <p
          className="hero-rise mt-6 max-w-[34rem] text-[17px] leading-[1.6] text-muted-foreground"
          style={{ animationDelay: "80ms" }}
        >
          Move beyond generic coding tests. Vetted builds personalized
          technical assessments around your real projects, skills and
          experience.
        </p>
        <div
          className="hero-rise mt-9 flex flex-wrap items-center gap-x-6 gap-y-4"
          style={{ animationDelay: "160ms" }}
        >
          <Button size="lg" className="signed-out-only h-10 px-5" asChild>
            <Link href="/dashboard">Get started</Link>
          </Button>
          <Button size="lg" className="signed-in-only h-10 px-5" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <ArrowLink href="#how-it-works">See how it works</ArrowLink>
        </div>

        <div className="mt-8 flex flex-col gap-10 lg:mt-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="hero-rise max-w-[26rem]" style={{ animationDelay: "320ms" }}>
            <p className="type-lead text-muted-foreground">
              Personalised coding assessments, written from the projects
              you&apos;ve actually built.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Button size="lg" className="h-10 px-5" asChild>
                <Link href="/dashboard">Get started</Link>
              </Button>
              <ArrowLink href="#how-it-works">See how it works</ArrowLink>
            </div>
          </div>

          <p
            className="type-display hero-rise text-[clamp(2.25rem,4vw,3.75rem)] [word-spacing:0.1em] whitespace-nowrap text-foreground lg:text-right"
            style={{ animationDelay: "420ms" }}
          >
            <span className="text-muted-foreground">/</span> Not a
            <span className="mt-[0.16em] flex items-end gap-[0.18em] lg:justify-end">
              <span
                aria-hidden="true"
                className="mb-[0.1em] hidden h-[0.09em] w-[1.8em] bg-foreground sm:block"
              />
              Question bank.
            </span>
          </p>
        </div>
      </Container>

      <Ticker items={topics} />
    </section>
  );
}

function Ticker({ items }: { items: readonly string[] }) {
  const run = (hidden: boolean) => (
    <ul
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-8 pr-8"
    >
      {items.map((item) => (
        <li key={item} className="flex items-center gap-8 whitespace-nowrap">
          {item}
          <span aria-hidden="true" className="text-accent-strong">
            +
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative overflow-hidden border-y border-border-subtle py-4 [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
      <p className="sr-only">
        Assessments cover the languages and topics in your portfolio.
      </p>
      <div className="ticker-track type-label flex w-max text-muted-foreground">
        {run(false)}
        {run(true)}
      </div>
    </div>
  );
}
