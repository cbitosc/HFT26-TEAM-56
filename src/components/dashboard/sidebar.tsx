"use client";

import { Suspense, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  FileBarChart,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Wordmark } from "@/components/brand/wordmark";
import { ResizeHandle } from "@/components/shell/resize-handle";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { SIDEBAR_SIZE } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/assessments", label: "Assessments", icon: ListChecks },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
] as const;

export function isActive(pathname: string, href: string, exact?: boolean) {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarSlots = {
  /** The signed-in account (server-rendered). */
  account: ReactNode;
  /** Recent assessments (server-rendered). */
  recent: ReactNode;
};

function SidebarContent({ account, recent, onClose }: SidebarSlots & { onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
        <Link
          href="/dashboard"
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Wordmark className="text-[20px]" />
        </Link>
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          {onClose ? (
            <Button variant="ghost" size="icon-sm" aria-label="Close navigation" onClick={onClose}>
              <X />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
        {/* The current path is request data on dynamic routes, so the active
            state streams in; the fallback is the same links, unhighlighted. */}
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNavLinks />
        </Suspense>

        <section aria-labelledby="sidebar-recent" className="mt-7 border-t border-border-subtle pt-5">
          <h2 id="sidebar-recent" className="px-2 pb-1.5 text-xs text-faint">
            Recent assessments
          </h2>
          {recent}
        </section>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-border p-2">
        {account}
        <form action={signOut}>
          <LogoutButton />
        </form>
      </div>
    </div>
  );
}

function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Dashboard" className="motion-stagger flex flex-col gap-0.5">
      {navItems.map(({ href, label, icon: Icon, ...item }, index) => {
        const active = pathname !== null && isActive(pathname, href, "exact" in item && item.exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            style={{ "--i": index } as CSSProperties}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              active
                ? "bg-foreground/[0.13] font-medium text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active ? "text-primary" : "text-faint")} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={pending ? "Logging out…" : "Logout"}
      title="Logout"
      className="text-muted-foreground hover:text-foreground"
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
    </Button>
  );
}

/**
 * The navigation sidebar from the lg breakpoint up. Its right edge drags
 * between 306 and 400px; the width is kept on this device.
 */
export function Sidebar(slots: SidebarSlots) {
  return (
    <aside
      id="app-sidebar"
      aria-label="Navigation"
      className="on-sidebar relative hidden h-full shrink-0 rounded-xl lg:block"
      style={{ width: "var(--sidebar-width)" }}
    >
      <SidebarContent {...slots} />
      <ResizeHandle size={SIDEBAR_SIZE} edge="right" label="Resize navigation" controls="app-sidebar" />
    </aside>
  );
}

/** Menu button and slide-over navigation below the lg breakpoint. */
export function MobileNav(slots: SidebarSlots) {
  const [open, setOpen] = useState(false);

  // Close once a link is followed, including links rendered on the server.
  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if ((event.target as Element).closest("a[href]")) setOpen(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="-ml-1.5 lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="motion-overlay fixed inset-0 z-50 bg-black/45 lg:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onClickCapture={onClickCapture}
          className="on-sidebar motion-drawer-left fixed inset-y-2 left-2 z-50 w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.45)] outline-none lg:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <SidebarContent {...slots} onClose={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
