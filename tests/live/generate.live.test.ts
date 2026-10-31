import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIER_CONFIG, TIERS } from "@/lib/assessment/config";
import { generateAssessment } from "@/lib/assessment/generate";
import { typescriptProfile } from "../fixtures/profiles";

// Opt-in: calls the real model configured in .env.local and costs credits.
//   LIVE_AI=1 npx vitest run tests/live
// Next's env loader skips .env.local under NODE_ENV=test, so read it here.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
const live = process.env.LIVE_AI === "1";

describe.skipIf(!live)("live generation", () => {
  it("generates a fully validated assessment with the configured model", { timeout: 600_000 }, async () => {
    const started = Date.now();
    const result = await generateAssessment(typescriptProfile);
    const seconds = Math.round((Date.now() - started) / 1000);

    console.log(`\nGenerated in ${seconds}s with ${result.model}`);
    console.log(result.log.map((line) => `  ${line}`).join("\n"));
    for (const tier of TIERS) {
      console.log(`\n${TIER_CONFIG[tier].label}`);
      for (const question of result.questions.filter((q) => q.tier === tier)) {
        const detail =
          question.kind === "practical"
            ? `${question.language}, ${question.source}, ${question.tests.length} tests (${question.tests.filter((t) => t.hidden).length} hidden)`
            : `${question.rubric.criteria.length} criteria`;
        console.log(`  [${question.type}] ${question.title} (${question.timeMinutes} min; ${detail})`);
        console.log(`      skills: ${question.skillsTested.join(", ")} | evidence: ${question.resumeEvidence[0]?.slice(0, 90)}`);
      }
    }

    // LIVE_AI_OUT=path writes the full result for manual review.
    if (process.env.LIVE_AI_OUT) {
      writeFileSync(process.env.LIVE_AI_OUT, JSON.stringify({ seconds, ...result }, null, 2));
    }

    expect(result.questions).toHaveLength(12);
    for (const tier of TIERS) {
      const inTier = result.questions.filter((question) => question.tier === tier);
      expect(inTier).toHaveLength(4);
      expect(inTier.reduce((sum, question) => sum + question.timeMinutes, 0)).toBe(TIER_CONFIG[tier].minutes);
    }
  });
});
