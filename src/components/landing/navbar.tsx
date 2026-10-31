"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/landing/container";
import { navLinks } from "@/components/landing/nav-links";
import { cn } from "@/lib/utils";

/** A section counts as current once its top passes this far down the viewport. */
const SPY_OFFSET = 0.35;
/** Below this scroll depth the bar never hides. */
const HIDE_AFTER = 160;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    let lastY = window.scrollY;

    function update() {
      frame = 0;
      const y = window.scrollY;
      const root = document.documentElement;
      const max = Math.max(root.scrollHeight - window.innerHeight, 1);

      setScrolled(y > 8);
      progressRef.current?.style.setProperty(
        "--nav-progress",
        (y / max).toFixed(4),
      );

      // Hide while reading down the page; come back on any scroll up.
      const delta = y - lastY;
      if (y < HIDE_AFTER || delta < -4) setHidden(false);
      else if (delta > 4) setHidden(true);
      lastY = y;

      if (y + window.innerHeight >= root.scrollHeight - 2) {
        setCurrent(navLinks[navLinks.length - 1].href);
        return;
      }
      const line = window.innerHeight * SPY_OFFSET;
      let next: string | null = null;
      for (const link of navLinks) {
        const target = document.getElementById(link.href.slice(1));
        if (target && target.getBoundingClientRect().top <= line) {
          next = link.href;
        }
      }
      setCurrent(next);
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Slide the marker under the current link.
  useLayoutEffect(() => {
    function place() {
      const nav = navRef.current;
      const marker = markerRef.current;
      if (!nav || !marker) return;
      const link = current
        ? nav.querySelector<HTMLElement>(`a[href="${current}"]`)
        : null;
      if (!link) {
        marker.style.opacity = "0";
        return;
      }
      marker.style.opacity = "1";
      marker.style.transform = `translateX(${link.offsetLeft}px)`;
      marker.style.width = `${link.offsetWidth}px`;
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [current]);

  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    window.__lenis?.stop();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    function onResize() {
      if (window.matchMedia("(min-width: 768px)").matches) setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      root.style.overflow = previousOverflow;
      window.__lenis?.start();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  const solid = scrolled || open;
  const tucked = hidden && !open;

  return (
    <header
      // Keyboard users never lose the bar: focus inside brings it back.
      onFocus={() => setHidden(false)}
      className={cn(
        "sticky top-0 z-50 border-b transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        solid
          ? "border-border-subtle bg-background/95"
          : "border-transparent bg-transparent",
        tucked && "-translate-y-full",
      )}
    >
      <Container className="relative flex h-14 items-center justify-between">
        <Link
          href="/"
          aria-label="Vetted home"
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={close}
        >
          <Wordmark withMark className="text-[20px] sm:text-[21px]" />
        </Link>

        <nav
          ref={navRef}
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex"
        >
          {navLinks.map((link) => {
            const active = current === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "rounded-sm py-1 text-[13px] transition-colors duration-200 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {link.label}
              </a>
            );
          })}
          <span
            ref={markerRef}
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-[11px] left-0 h-[2px] bg-accent-strong opacity-0 transition-[transform,width,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </nav>

        <div className="flex items-center justify-end gap-5">
          <Link
            href="/login"
            className="hidden rounded-sm text-[13px] text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 sm:inline"
          >
            Sign in
          </Link>
          <Button size="sm" className="h-8 px-3.5 text-[13px]" asChild>
            <Link href="/dashboard" onClick={close}>
              Get started
            </Link>
          </Button>
          <Button
            ref={toggleRef}
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

      {/* Reading progress through the page. */}
      <span
        ref={progressRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 -bottom-px h-px origin-left scale-x-[var(--nav-progress,0)] bg-accent-strong/80 transition-opacity duration-300",
          solid ? "opacity-100" : "opacity-0",
        )}
      />

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          data-lenis-prevent
          className="fixed inset-x-0 top-14 bottom-0 overflow-y-auto overscroll-contain bg-background md:hidden"
        >
          <Container className="flex min-h-full flex-col pt-8 pb-8">
            <ul className="flex flex-col gap-2">
              {navLinks.map((link, index) => {
                const active = current === link.href;
                return (
                  <li
                    key={link.href}
                    className="hero-rise"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <a
                      href={link.href}
                      onClick={close}
                      aria-current={active ? "location" : undefined}
                      className={cn(
                        "type-display flex items-center gap-4 rounded-sm text-[clamp(3.25rem,17vw,5rem)] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        active ? "text-foreground" : "text-foreground/45 hover:text-foreground",
                      )}
                    >
                      {link.label}
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full bg-accent-strong"
                        />
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto flex flex-col gap-3 pt-10">
              <Button size="lg" asChild>
                <Link href="/dashboard" onClick={close}>
                  Get started
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
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
