import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { SidebarAccount, SidebarAccountSkeleton } from "@/components/auth/user-menu";
import { RecentAssessments, RecentAssessmentsSkeleton } from "@/components/dashboard/recent-assessments";

/**
 * Shared chrome for signed-in routes. The proxy redirects signed-out visitors
 * optimistically; SidebarAccount re-verifies the session on the server.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      account={
        <Suspense fallback={<SidebarAccountSkeleton />}>
          <SidebarAccount />
        </Suspense>
      }
      recent={
        <Suspense fallback={<RecentAssessmentsSkeleton />}>
          <RecentAssessments />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
