import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Container } from "@/components/landing/container";
import { navLinks } from "@/components/landing/nav-links";

export function Footer() {
  return (
    <footer id="about" className="scroll-mt-20 border-t border-border-subtle">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link
            href="/"
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Wordmark />
          </Link>
          <p className="type-body mt-4 max-w-xs text-muted-foreground">
            Technical assessments written from the code you&apos;ve already
            shipped, and scored the same way every time.
          </p>
        </div>
        <div>
          <p className="type-label text-faint">Product</p>
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
          <p className="type-label text-faint">About</p>
          <p className="type-body mt-4 max-w-xs text-muted-foreground">
            Vetted is built for developers whose strongest evidence lives in
            their repositories, and for the teams who want to read it.
          </p>
        </div>
      </Container>
      <div className="border-t border-border">
        <Container className="type-annotation py-5 text-faint">
          © 2026 vetted.
        </Container>
      </div>
    </footer>
  );
}
