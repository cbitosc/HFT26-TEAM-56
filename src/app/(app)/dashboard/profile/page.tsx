import { Suspense } from "react";
import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { UserAvatar } from "@/components/auth/user-avatar";
import { formatDate } from "@/components/dashboard/assessment-list";
import { PageHeader, SectionHeading } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { displayName, getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Profile · vetted.",
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
};

export default function ProfilePage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Profile" description="Your account details." />
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-72 rounded-lg" role="status" aria-label="Loading profile" />}>
          <ProfileDetails />
        </Suspense>
      </div>
    </div>
  );
}

async function ProfileDetails() {
  const user = await getCurrentUser();
  const name = displayName(user);

  const rows = [
    { label: "Name", value: user.fullName ?? "—" },
    { label: "Email", value: user.email ?? "—" },
    {
      label: "Signed in with",
      value: user.provider ? (PROVIDER_LABEL[user.provider] ?? user.provider) : "—",
    },
    {
      label: "Member since",
      value: user.createdAt ? formatDate(user.createdAt) : "—",
    },
  ];

  return (
    <div className="space-y-8">
      <section aria-labelledby="account-heading">
        <SectionHeading id="account-heading" title="Account" />
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center gap-4 border-b border-border px-5 py-4">
            <UserAvatar name={name} src={user.avatarUrl} className="size-11" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-foreground">{name}</p>
              {user.email ? <p className="truncate text-[13px] text-muted-foreground">{user.email}</p> : null}
            </div>
          </div>
          <dl className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.label} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[180px_1fr]">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 truncate text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="session-heading">
        <SectionHeading id="session-heading" title="Session" />
        <div className="mt-3 flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">Sign out of Vetted on this device.</p>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut aria-hidden="true" />
              Logout
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
