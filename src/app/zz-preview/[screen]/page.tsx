// TEMPORARY local design-verification route. Delete before committing.
import { Suspense } from "react";
import { AssessmentWorkspace } from "@/components/assessment/workspace/assessment-workspace";
import { TIER_CONFIG, TIERS } from "@/lib/assessment/config";
import type { AssessmentSession } from "@/lib/assessment/session";

const at = (m: number) => new Date(Date.UTC(2026, 9, 31, 10, m)).toISOString();

function session(): AssessmentSession {
  const questions = [0, 1, 2, 3].map((i) => ({
    id: `adept-${i}`, number: 5 + i, tier: "adept" as const, difficulty: "medium", kind: "written" as const, type: "theory",
    title: "Designing a secure approval workflow", statement: "Explain.", resumeEvidence: [], skillsTested: [], timeMinutes: 5,
    order: i, language: null, entryPoint: null, starterFiles: [], exampleTests: [], aiAssistance: true,
  }));
  const now = Date.parse(at(12));
  return {
    assessmentId: "a1", status: "in_progress", technicalDomain: null, startedAt: at(0),
    expiresAt: new Date(now + 40 * 60_000).toISOString(), completedAt: null, serverTime: new Date(now).toISOString(),
    stages: TIERS.map((t) => ({
      tier: t, label: TIER_CONFIG[t].label, difficulty: TIER_CONFIG[t].difficulty,
      status: t === "adept" ? "active" : t === "novice" ? "submitted" : "locked", minutes: TIER_CONFIG[t].minutes,
      aiAssistance: TIER_CONFIG[t].aiAssistance, startedAt: t === "adept" ? at(0) : null,
      expiresAt: t === "adept" ? new Date(now + 13 * 60_000).toISOString() : null, submittedAt: null,
    })),
    currentTier: "adept", questions, answers: {}, lastRuns: {}, submissions: {}, passingCode: {}, chats: {}, summary: null,
  };
}

export default function Preview() {
  return <Suspense><AssessmentWorkspace initialSession={session()} /></Suspense>;
}
