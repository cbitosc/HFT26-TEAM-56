"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-lg border border-border bg-card px-6 py-12 text-center">
      <span className="flex size-9 items-center justify-center rounded-md border border-destructive/30 bg-destructive/[0.06]">
        <CircleAlert className="size-4 text-destructive" aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm font-medium text-foreground">Something went wrong</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">
        We couldn&apos;t load this page. Please try again in a moment.
      </p>
      <Button variant="outline" size="sm" className="mt-5" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
