import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLink } from "@/components/landing/arrow-link";
import { Container } from "@/components/landing/container";
import { DashboardPreview } from "@/components/dashboard/dashboard-preview";

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
          <Button size="lg" className="h-10 px-5" asChild>
            <Link href="/dashboard">Get started</Link>
          </Button>
          <ArrowLink href="#how-it-works">See how it works</ArrowLink>
        </div>
      </Container>

      <Container
        id="preview"
        className="scroll-mt-20 pt-16 pb-24 sm:pt-20 lg:pt-24 lg:pb-28"
      >
        <div className="hero-present">
          <DashboardPreview />
        </div>
      </Container>
    </section>
  );
}
