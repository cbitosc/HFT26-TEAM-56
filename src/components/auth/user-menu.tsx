import Link from "next/link";
import { UserAvatar } from "@/components/auth/user-avatar";
import { displayName, getCurrentUser } from "@/lib/auth";

/** The signed-in account at the foot of the sidebar; links to the profile. */
export async function SidebarAccount() {
  const user = await getCurrentUser();
  const name = displayName(user);

  return (
    <Link
      href="/dashboard/profile"
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <UserAvatar name={name} src={user.avatarUrl} className="size-7" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] leading-5 text-foreground">{name}</span>
        {user.email ? (
          <span className="block truncate text-xs leading-4 text-muted-foreground">{user.email}</span>
        ) : null}
      </span>
    </Link>
  );
}

export function SidebarAccountSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-1 items-center gap-2.5 px-2 py-1.5">
      <span className="size-7 shrink-0 rounded-full bg-surface-2" />
      <span className="flex-1 space-y-1.5">
        <span className="block h-3 w-24 rounded bg-surface-2" />
        <span className="block h-2.5 w-32 rounded bg-surface-2" />
      </span>
    </div>
  );
}
