import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { navLinks } from "@/components/landing/nav-links";

export function Footer() {
  return (
    <footer id="about" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link
            href="/"
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Wordmark />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
            Personalized technical assessments built from the projects,
            skills, and experience you already have.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Product
          </p>
          <ul className="mt-4 space-y-2.5">
            {navLinks
              .filter((link) => link.href !== "#about")
              .map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-foreground/80 transition-colors duration-200 hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            About
          </p>
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
            Vetted measures developers on the work they can actually do,
            not on a generic test.
          </p>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto w-full max-w-6xl px-5 py-5 text-xs text-muted-foreground sm:px-8">
          © 2026 vetted.
        </p>
      </div>
    </footer>
  );
}
