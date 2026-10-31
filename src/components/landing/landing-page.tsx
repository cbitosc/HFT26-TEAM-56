import {
  Atmosphere,
  ColumnGuides,
  HeroAtmosphere,
} from "@/components/landing/atmosphere";
import { Features } from "@/components/landing/features";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import { Problem } from "@/components/landing/problem";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { ProductStory } from "@/components/story/product-story";

/**
 * The marketing page. `brand-noir` scopes the Noir Burgundy palette to it, so
 * the app's own light and dark themes are untouched.
 */
export function LandingPage() {
  return (
    <div className="brand-noir page-clip relative isolate flex flex-1 flex-col">
      <a
        href="#main"
        className="sr-only rounded-md bg-foreground px-4 py-2 text-sm text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
      >
        Skip to content
      </a>
      <SmoothScroll />
      <Atmosphere />
      <HeroAtmosphere />
      <ColumnGuides />
      <Navbar />
      <main id="main">
        <Hero />
        <ProductStory />
        <Problem />
        <Features />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
