import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
};

export function Section({ id, children, className }: SectionProps) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-20 border-t border-border", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        {children}
      </div>
    </section>
  );
}
