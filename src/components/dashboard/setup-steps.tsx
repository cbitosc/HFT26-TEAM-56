import { cn } from "@/lib/utils";

const steps = [
  {
    title: "Submit your résumé",
    body: "Upload a PDF. We read your projects and experience.",
  },
  {
    title: "Get personalized challenges",
    body: "Each one is built from something you've worked on.",
  },
  {
    title: "Prove your skills",
    body: "Solve them in the browser and get an evidence-based report.",
  },
] as const;

export function SetupSteps({ className }: { className?: string }) {
  return (
    <section aria-labelledby="setup-steps-heading" className={className}>
      <h2 id="setup-steps-heading" className="text-sm font-medium text-foreground">
        How it works
      </h2>
      <ol className="mt-4 space-y-5">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] tabular-nums",
                index === 0 ? "border-primary/40 text-primary" : "border-border text-faint",
              )}
            >
              {index + 1}
            </span>
            <div>
              <p className="text-sm text-foreground">{step.title}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
