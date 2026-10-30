import { FileText, Layers, ListX } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";

const problems = [
  {
    icon: ListX,
    title: "Experience gets ignored",
    body: "Generic coding tests ignore individual experience.",
  },
  {
    icon: FileText,
    title: "Keywords are not ability",
    body: "Resume keywords don't prove technical ability.",
  },
  {
    icon: Layers,
    title: "One template for everyone",
    body: "One-size-fits-all assessments fail to measure real-world skills.",
  },
];

export function Problem() {
  return (
    <Section>
      <Reveal>
        <h2 className="max-w-xl text-3xl font-medium tracking-[-0.04em] text-balance sm:text-4xl lg:text-5xl lg:leading-[1.1]">
          Traditional assessments don&apos;t tell the whole story.
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {problems.map((problem) => (
          <Reveal key={problem.title}>
            <Card className="h-full gap-4 transition-colors duration-200 hover:border-primary/35">
              <CardHeader>
                <problem.icon
                  className="size-4 text-primary"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
                <CardTitle className="text-base font-medium tracking-[-0.02em]">
                  {problem.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  {problem.body}
                </p>
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
