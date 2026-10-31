"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand/wordmark";
import { navItems } from "@/components/dashboard/sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The navigation sidebar collapsed to icons while an assessment is open, so
 * the question and the editor keep the width. Same links as the dashboard.
 */
export function WorkspaceRail() {
  return (
    <TooltipProvider>
      <nav
        aria-label="Dashboard"
        className="on-sidebar hidden w-[52px] shrink-0 flex-col items-center gap-1 rounded-xl py-3 lg:flex"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/dashboard"
              aria-label="vetted. dashboard"
              className="mb-3 flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <BrandMark className="size-7" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">vetted.</TooltipContent>
        </Tooltip>
        {navItems.map(({ href, label, icon: Icon }) => (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <Link
                href={href}
                aria-label={label}
                className="flex size-8 items-center justify-center rounded-md text-faint transition-colors duration-150 outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <Icon className="size-4" aria-hidden="true" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}
        <ThemeToggle className="mt-auto" />
      </nav>
    </TooltipProvider>
  );
}
