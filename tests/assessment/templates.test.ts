import { describe, expect, it } from "vitest";
import { buildPythonHarness, parseHarnessOutput } from "@/lib/assessment/harness";
import { CHALLENGE_TEMPLATES, templatesFor } from "@/lib/assessment/templates";
import { TIER_CONFIG, TIERS } from "@/lib/assessment/config";
import { runTests } from "@/lib/sandbox/quickjs";
import { findPython, runPython } from "../helpers/python";

const python = findPython();

describe("challenge templates", () => {
  it("cover every practical slot of every tier", () => {
    for (const tier of TIERS) {
      expect(templatesFor(tier).length).toBeGreaterThanOrEqual(TIER_CONFIG[tier].practical);
    }
  });

  it.each(CHALLENGE_TEMPLATES.map((template) => [template.id, template] as const))(
    "%s has visible and hidden tests",
    (_id, template) => {
      expect(template.tests.filter((test) => !test.hidden).length).toBeGreaterThanOrEqual(2);
      expect(template.tests.filter((test) => test.hidden).length).toBeGreaterThanOrEqual(3);
    },
  );

  describe.each(CHALLENGE_TEMPLATES.map((template) => [template.id, template] as const))(
    "%s (TypeScript, sandbox)",
    (_id, template) => {
      it("reference passes every test", async () => {
        const run = await runTests("typescript", template.reference.typescript, template.entry.typescript, template.tests);
        expect(run.ok && run.results.filter((r) => !r.passed)).toEqual([]);
      });
      it("starter fails at least one test", async () => {
        const run = await runTests("typescript", template.starter.typescript, template.entry.typescript, template.tests);
        expect(run.ok).toBe(true);
        if (run.ok) expect(run.passed).toBeLessThan(run.total);
      });
    },
  );

  describe.skipIf(!python).each(CHALLENGE_TEMPLATES.map((template) => [template.id, template] as const))(
    "%s (Python, local interpreter)",
    (_id, template) => {
      const run = (code: string) =>
        parseHarnessOutput(runPython(python!, buildPythonHarness(code, template.entry.python, template.tests)));
      it("reference passes every test", () => {
        expect(run(template.reference.python).filter((r) => !r.passed)).toEqual([]);
      });
      it("starter fails at least one test", () => {
        expect(run(template.starter.python).some((r) => !r.passed)).toBe(true);
      });
    },
  );
});
