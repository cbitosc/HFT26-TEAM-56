"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { navLinks } from "@/components/landing/nav-links";

export function Navbar() {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="relative flex h-12 items-center justify-between px-5 sm:px-8 xl:px-[18%]">
        <Link
          href="/"
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={close}
        >
          <Wordmark className="text-[15px]" />
        </Link>

        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 md:flex"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/get-started">Get started</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-border px-5 py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={close}
                className="rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/sign-in"
              onClick={close}
              className="rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground sm:hidden"
            >
              Sign in
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
