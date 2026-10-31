import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { MobileNav, Sidebar } from "@/components/dashboard/sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type AppShellProps = {
  children: ReactNode;
  /** The signed-in account, shown at the foot of the sidebar. */
  account: ReactNode;
  /** Recent assessments, listed in the sidebar. */
  recent: ReactNode;
};

/**
 * Sidebar | workspace as two rounded panels on the canvas from lg up; the
 * sidebar is resizable there and a drawer below. The workspace scrolls on
 * its own, so the sidebar stays put.
 */
export function AppShell({ children, account, recent }: AppShellProps) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background lg:gap-2 lg:bg-canvas lg:p-2">
      <Sidebar account={account} recent={recent} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-xl lg:border lg:border-border lg:shadow-(--panel-shadow)">
        <header className="shrink-0 border-b border-border bg-background lg:hidden">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
            <MobileNav account={account} recent={recent} />
            <Link
              href="/dashboard"
              className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Wordmark withMark />
            </Link>
            <ThemeToggle className="ml-auto" />
          </div>
        </header>
        <main className="scroll-thin min-h-0 w-full flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
