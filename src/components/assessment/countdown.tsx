"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type CountdownProps = {
  /** Deadline recorded by the database when the assessment started. */
  expiresAt: string;
  /** The server's clock when the page rendered, to correct for a skewed device clock. */
  serverNow: number;
  className?: string;
};

function format(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Time left until the server-side deadline. The device clock is only used to
 * tick; it's offset against the server's clock, so changing it doesn't add time.
 * Refreshes the page when time runs out so the server can mark it expired.
 */
export function Countdown({ expiresAt, serverNow, className }: CountdownProps) {
  const router = useRouter();
  const deadline = new Date(expiresAt).getTime();
  // The first render uses only the server's time, so prerendering stays
  // deterministic; the device clock is read only after mounting.
  const [remaining, setRemaining] = useState(() => deadline - serverNow);

  useEffect(() => {
    const offset = serverNow - Date.now();
    const tick = setInterval(() => {
      const left = deadline - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        router.refresh();
      }
    }, 1_000);
    return () => clearInterval(tick);
  }, [deadline, serverNow, router]);

  const low = remaining <= 5 * 60_000;
  return (
    <span
      role="timer"
      aria-label={`${format(remaining)} remaining`}
      className={cn("tabular-nums", low ? "text-destructive" : "text-foreground", className)}
    >
      {format(remaining)}
    </span>
  );
}
