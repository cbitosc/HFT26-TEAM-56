import { Journey } from "@/components/story/journey";

/**
 * How it works: the pinned 3D journey, which takes over from the hero's
 * dashboard. It calms itself for reduced motion and falls back to a plain
 * list when WebGL is unavailable.
 */
export function ProductStory() {
  return (
    <section id="how-it-works" className="relative scroll-mt-14">
      <Journey />
    </section>
  );
}
