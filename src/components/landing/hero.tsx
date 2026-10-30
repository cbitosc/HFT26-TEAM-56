import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DashboardPreview } from "@/components/dashboard/dashboard-preview";

export function Hero() {
  return (
    <section className="hero-shell">
      <div className="pointer-events-none relative z-10 px-5 pt-16 sm:px-8 sm:pt-20 xl:px-[18%] xl:pt-24">
        <h1 className="hero-rise text-left text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.04] tracking-[-0.045em] text-foreground">
          Your portfolio tells a <span className="text-primary">story</span>.
          <br />
          Let&apos;s put it to the <span className="text-primary">test</span>.
        </h1>
        <p
          className="hero-rise mt-4 max-w-lg text-left text-[15px] leading-7 text-muted-foreground sm:text-base"
          style={{ animationDelay: "80ms" }}
        >
          Move beyond generic coding tests. Vetted builds personalized
          technical assessments around your real projects, skills and
          experience.
        </p>
        <div
          className="hero-rise pointer-events-auto mt-6 flex flex-col items-start gap-3 sm:flex-row"
          style={{ animationDelay: "160ms" }}
        >
          <Button size="lg" asChild>
            <Link href="/get-started">Get started</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="#preview">Explore the platform</a>
          </Button>
        </div>
      </div>

      <div id="preview" className="hero-stage scroll-mt-16">
        <div className="hero-present">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
