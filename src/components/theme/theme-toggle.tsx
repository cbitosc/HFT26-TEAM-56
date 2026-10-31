"use client";

import { useLayoutEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  getSystemTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
};

/**
 * The theme itself is applied by the inline script in the root layout. Icons
 * swap through the `dark:` variant, so the button renders identically on the
 * server and the client and never causes a hydration mismatch.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  useLayoutEffect(() => {
    // React's dev remount resets <html> attributes; re-apply. No-op in production.
    applyTheme(getStoredTheme() ?? getSystemTheme());

    // Follow the OS setting until the user picks a theme explicitly.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      if (!getStoredTheme()) applyTheme(getSystemTheme());
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className={cn("text-muted-foreground hover:text-foreground", className)}
      onClick={toggle}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
