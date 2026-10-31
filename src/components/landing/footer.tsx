import Link from "next/link";
import { Container } from "@/components/landing/container";
import { navLinks } from "@/components/landing/nav-links";

const links = [
  ...navLinks.filter((link) => link.href !== "#about"),
  { href: "/dashboard", label: "Get started" },
  { href: "/login", label: "Sign in" },
] as const;

const linkClass =
  "rounded-sm text-sm text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

export function Footer() {
  return (
    <footer
      id="about"
      className="relative scroll-mt-20 overflow-hidden border-t border-border-subtle"
    >
      <Container className="flex flex-col gap-8 pt-14 sm:flex-row sm:items-start sm:justify-between lg:pt-16">
        <p className="type-body max-w-xs text-muted-foreground">
          Technical assessments built from your portfolio. Prove what you can
          build.
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-7 gap-y-3">
            {links.map((link) => (
              <li key={link.href}>
                {link.href.startsWith("#") ? (
                  <a href={link.href} className={linkClass}>
                    {link.label}
                  </a>
                ) : (
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </Container>

      {/* The closing image: the wordmark at full width, cropped by the page edge. */}
      <Container>
        <p
          aria-hidden="true"
          className="mt-10 -mb-[0.2em] text-[clamp(6rem,27vw,23rem)] leading-[0.9] font-semibold tracking-[-0.06em] text-foreground/[0.07] select-none lg:mt-14"
        >
          vetted<span className="text-accent-strong/70">.</span>
        </p>
      </Container>

      <div className="relative border-t border-border-subtle bg-background">
        <Container className="type-annotation flex flex-col gap-2 py-5 text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 vetted.</p>
          <p>Assessments built from real work.</p>
        </Container>
      </div>
    </footer>
  );
}
