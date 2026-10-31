import { randomUUID } from "node:crypto";
import { TIER_CONFIG, TIERS } from "@/lib/assessment/config";

/** Twelve question rows (and secrets) shaped like saveGeneratedQuestions() builds them. */
export function generatedRows({ count = 12 }: { count?: number } = {}) {
  const questions: Record<string, unknown>[] = [];
  const secrets: Record<string, unknown>[] = [];
  let order = 0;
  for (const tier of TIERS) {
    const config = TIER_CONFIG[tier];
    const types = [
      ...Object.entries(config.written).flatMap(([type, n]) => Array(n).fill(type)),
      ...Array(config.practical).fill(config.practicalTypes[0]),
    ];
    for (const type of types) {
      const id = randomUUID();
      const practical = type === "coding" || type === "debugging";
      questions.push({
        id,
        tier,
        difficulty: config.difficulty,
        question_type: type,
        kind: practical ? "practical" : "written",
        title: `${tier} ${type} ${order}`,
        description: "Public statement",
        resume_evidence: ["Built an order dashboard"],
        skills_tested: ["TypeScript"],
        starter_files: practical ? [{ path: "solution.ts", content: "export function solve() {}" }] : [],
        example_tests: practical ? [{ name: "visible", args: [1], expected: 1, expectThrows: false }] : [],
        time_allocation_minutes: 2,
        display_order: order++,
        language: practical ? "typescript" : null,
        entry_point: practical ? "solve" : null,
        ai_assistance: config.aiAssistance,
      });
      secrets.push({
        question_id: id,
        reference_files: practical ? [{ path: "solution.ts", content: "SECRET REFERENCE" }] : [],
        hidden_tests: practical ? [{ name: "hidden", args: [2], expected: 2, hidden: true }] : [],
        grading_criteria: { kind: practical ? "practical" : "written", modelAnswer: "SECRET RUBRIC" },
        validation_report: practical ? { method: "sandbox" } : null,
      });
    }
  }
  return { questions: questions.slice(0, count), secrets: secrets.slice(0, count) };
}
