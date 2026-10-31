import type { ReactNode } from "react";
import { GridMarks, SectionLight } from "@/components/landing/atmosphere";
import { Container } from "@/components/landing/container";
import { cn } from "@/lib/utils";

type SectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  light?: "band" | "horizon" | "veil" | "drift";
  /** Replaces the default vertical padding; `cn` does not merge conflicts. */
  padding?: string;
};

export function Section({
  id,
  children,
  className,
  light,
  padding = "py-24 lg:py-32",
}: SectionProps) {
  return (
    <section id={id} className={cn("relative scroll-mt-20", className)}>
      {light ? <SectionLight variant={light} /> : null}
      <GridMarks />
      <Container className={cn("relative", padding)}>{children}</Container>
    </section>
  );
}
