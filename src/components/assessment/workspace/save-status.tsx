import { Check, CloudOff, LoaderCircle, Lock } from "lucide-react";
import type { SaveState } from "@/lib/assessment/autosave";
import { cn } from "@/lib/utils";

/** "Saved", "Saving…", "Couldn't save, retrying" and friends. */
export function SaveStatus({ state, error, className }: { state: SaveState; error: string | null; className?: string }) {
  const content = {
    idle: null,
    pending: <>Unsaved changes</>,
    saving: (
      <>
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Saving…
      </>
    ),
    saved: (
      <>
        <Check className="size-3" aria-hidden="true" /> Saved
      </>
    ),
    error: (
      <>
        <CloudOff className="size-3" aria-hidden="true" /> {error ?? "Couldn't save."} Retrying…
      </>
    ),
    locked: (
      <>
        <Lock className="size-3" aria-hidden="true" /> Locked
      </>
    ),
  }[state];
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-1.5 text-xs", state === "error" ? "text-destructive" : "text-muted-foreground", className)}
    >
      {content}
    </p>
  );
}
