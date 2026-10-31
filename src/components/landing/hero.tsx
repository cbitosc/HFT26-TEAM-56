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
    <section
      aria-labelledby="hero-title"
      className="relative flex min-h-[calc(100svh-3.5rem)] flex-col"
    >
      <Container className="grid flex-1 grid-rows-[1fr_auto] pt-10 pb-10 lg:pt-12 lg:pb-12">
        <div className="grid items-center gap-y-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-x-8">
          <h1
            id="hero-title"
            className="type-display relative z-10 text-[clamp(5.5rem,17vw,14rem)] text-foreground"
          >
            <span className="sr-only">Prove what you can build.</span>
            <span aria-hidden="true" className="block pt-[0.06em] [overflow-x:visible] [overflow-y:clip]">
              <span className="line-in block">
                <KineticWord text="Prove" />
              </span>
            </span>
            <span
              aria-hidden="true"
              className="hero-rise my-[0.07em] block pl-[0.04em] text-[max(0.17em,1.125rem)] leading-none [word-spacing:0.12em] text-accent-text"
              style={{ animationDelay: "200ms" }}
            >
              what you can
            </span>
            <span aria-hidden="true" className="block pb-[0.03em] [overflow-x:visible] [overflow-y:clip]">
              <span
                className="line-in block text-accent-strong"
                style={{ animationDelay: "120ms" }}
              >
                <KineticWord text="Build." />
              </span>
            </span>
          </h1>

          <div className="relative -mt-6 lg:mt-0">
            <HeroHandoff>
              <div className="mx-auto aspect-square w-full max-w-[17rem] sm:max-w-[22rem] lg:max-w-[30rem]">
                <HeroOrb />
              </div>
            </HeroHandoff>
          </div>
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
