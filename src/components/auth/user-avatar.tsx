import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  src: string | null;
  className?: string;
};

export function UserAvatar({ name, src, className }: UserAvatarProps) {
  const base = cn(
    "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2",
    className,
  );

  if (!src) {
    return (
      <span aria-hidden="true" className={cn(base, "text-xs font-medium text-muted-foreground")}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // Provider avatars come from arbitrary CDNs; a plain img avoids
    // maintaining an image-optimizer allowlist for them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className={cn(base, "object-cover")}
    />
  );
}
