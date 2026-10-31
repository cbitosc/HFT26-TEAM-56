"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { AuthHint } from "@/components/auth/auth-hint";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/landing/container";
import { navLinks } from "@/components/landing/nav-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function update() {
      setScrolled(window.scrollY > 8);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onResize() {
      if (window.matchMedia("(min-width: 768px)").matches) setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  const solid = scrolled || open;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color] duration-200",
        solid
          ? "border-border bg-background/95"
          : "border-transparent bg-transparent",
      )}
    >
      <Container className="relative flex h-14 items-center justify-between">
        <Link
          href="/"
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={close}
        >
          <Wordmark className="text-[25px]" />
        </Link>

        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 md:flex"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm text-[13px] text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-4">
          <ThemeToggle className="-mx-1.5" />
          <AuthHint />
          <Link
            href="/login"
            className="signed-out-only hidden rounded-sm text-[13px] text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 sm:inline"
          >
            Sign in
          </Link>
          <Button size="sm" className="signed-out-only h-8 px-3 text-[13px]" asChild>
            <Link href="/dashboard">Get started</Link>
          </Button>
          <Button size="sm" className="signed-in-only h-8 px-3 text-[13px]" asChild>
            <Link href="/dashboard">
              Dashboard
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-1.5 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </Container>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="fixed inset-x-0 top-14 bottom-0 overflow-y-auto border-t border-border bg-background md:hidden"
        >
          <Container className="flex min-h-full flex-col py-6">
            <ul className="flex flex-col">
              {navLinks.map((link) => (
                <li key={link.href} className="border-b border-border-subtle">
                  <a
                    href={link.href}
                    onClick={close}
                    className="block py-4 text-xl font-medium tracking-[-0.02em] text-foreground/90 transition-colors duration-150 outline-none hover:text-foreground focus-visible:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-3 pt-10">
              <Button size="lg" className="signed-in-only" asChild>
                <Link href="/dashboard" onClick={close}>
                  Go to dashboard
                </Link>
              </Button>
              <Button size="lg" className="signed-out-only" asChild>
                <Link href="/dashboard" onClick={close}>
                  Get started
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="signed-out-only" asChild>
                <Link href="/login" onClick={close}>
                  Sign in
                </Link>
              </Button>
            </div>
          </Container>
        </nav>
      ) : null}
    </header>
  );
}
