import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";
import { cn } from "@/lib/utils";

const tiers = ["Novice", "Adept", "Master"] as const;

const features = [
  {
    title: "Built from your portfolio",
    body: "Your projects, stack and skills shape every question you get.",
  },
  {
    title: "Pitched at your level",
    body: "Three tiers, matched to the experience your portfolio shows.",
    tiers: true,
  },
  {
    title: "Graded by tests",
    body: "Your code runs against real tests. The same code always gets the same score.",
  },
  {
    title: "AI that hints, never solves",
    body: "Ask for a nudge when you're stuck. It won't hand you the answer.",
  },
] as const;

export function Features() {
  return (
    <Section
      id="features"
      light="drift"
      padding="pt-24 pb-28 lg:pt-32 lg:pb-36"
    >
      <Reveal>
        <p className="type-label flex items-center gap-3 text-muted-foreground">
          <span aria-hidden="true" className="h-px w-5 bg-border-strong" />
          Features
        </p>
        <h2 className="type-display mt-6 text-[clamp(3.25rem,9vw,8rem)]">
          Fair by design<span className="text-accent-strong">.</span>
        </h2>
      </Reveal>

      <Reveal className="mt-14 lg:mt-20">
        {/* Hovering one row brings it forward and steps the others back. */}
        <ul className="group/list border-t border-border">
          {features.map((feature) => (
            <li
              key={feature.title}
              className="group/row relative grid gap-3 border-b border-border py-8 transition-opacity duration-300 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center md:gap-12 lg:py-10 [@media(hover:hover)]:group-hover/list:opacity-35 [@media(hover:hover)]:hover:!opacity-100"
            >
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-0 h-[2px] w-0 -translate-y-1/2 bg-accent-strong transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [@media(hover:hover)]:group-hover/row:w-6"
              />
              <h3 className="type-display text-[clamp(2.25rem,4.6vw,4.25rem)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [@media(hover:hover)]:group-hover/row:translate-x-10">
                {feature.title}
              </h3>
              <div>
                <p className="type-lead max-w-[28rem] text-muted-foreground">
                  {feature.body}
                </p>
                {"tiers" in feature ? <TierScale /> : null}
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}

/** The three difficulty tiers as one rising scale. */
function TierScale() {
  return (
    <ol aria-label="Difficulty tiers" className="mt-5 flex items-end gap-2">
      {tiers.map((tier, index) => (
        <li key={tier} className="flex flex-col gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "block w-16 origin-bottom rounded-[2px] transition-transform duration-500 sm:w-20 [@media(hover:hover)]:group-hover/row:scale-y-150",
              index === 2 ? "bg-accent-strong" : "bg-border-strong",
            )}
            style={{
              height: `${(index + 1) * 6}px`,
              transitionDelay: `${index * 60}ms`,
            }}
          />
          <span className="type-label text-muted-foreground">{tier}</span>
        </li>
      ))}
    </ol>
  );
}
