/** Static stand-in for the landing showcase. Not loaded from an API. */

import type { TestCheck } from "@/components/showcase/test-run";

export type TierId = "foundation" | "applied" | "advanced";

export type ChallengeStatus = "passed" | "in-progress" | "not-started";

export type PreviewTier = {
  id: TierId;
  label: string;
  summary: string;
  minutes: number;
  depth: 1 | 2 | 3;
  status: ChallengeStatus;
  source: string;
  title: string;
  prompt: string;
  file: string;
  caretLine?: number;
  lines: readonly string[];
  checks: readonly TestCheck[];
};

export const previewCandidate = {
  name: "Leila Okonkwo",
  initials: "LO",
  role: "Backend engineer",
  projects: 6,
  skills: [
    { name: "TypeScript", projects: 6 },
    { name: "APIs", projects: 4 },
    { name: "Graphs", projects: 2 },
    { name: "Systems", projects: 2 },
    { name: "Concurrency", projects: 1 },
  ],
} as const;

export const previewStages = [
  { id: "portfolio", label: "Portfolio", state: "done" },
  { id: "challenge", label: "Challenge", state: "current" },
  { id: "review", label: "Review", state: "upcoming" },
] as const;

export const previewActivity = [
  { id: "run-3", title: "Run 3 · shortest-path.ts", meta: "6 of 7 checks", time: "2m" },
  { id: "run-2", title: "Run 2 · shortest-path.ts", meta: "4 of 7 checks", time: "9m" },
  { id: "pass-1", title: "Passed burst-count.ts", meta: "5 of 5 checks", time: "31m" },
  { id: "scan", title: "Portfolio analysed", meta: "6 projects · 5 skills", time: "1h" },
] as const;

export const previewPortfolio = {
  analysed: "1h ago",
  projects: [
    { name: "pathfinder", summary: "Warehouse route planner", commits: 212 },
    { name: "log-pipeline", summary: "Request log ingestion", commits: 164 },
    { name: "edge-cache", summary: "Read-through CDN cache", commits: 97 },
    { name: "billing-api", summary: "Invoicing REST service", commits: 340 },
    { name: "queue-worker", summary: "Job retries and backoff", commits: 88 },
    { name: "cli-kit", summary: "Shared CLI utilities", commits: 41 },
  ],
  focus: {
    name: "pathfinder",
    description:
      "Plans routes for warehouse robots across a weighted floor grid, with walls and one-way aisles.",
    stats: "48 files · 212 commits · TypeScript",
    technologies: ["TypeScript", "Node.js", "Vitest", "Web Workers", "Canvas API"],
    skills: [
      { name: "Graph search", evidence: "src/search/dijkstra.ts" },
      { name: "Performance tuning", evidence: "bench/grid-200.bench.ts" },
      { name: "Test design", evidence: "test/search.spec.ts" },
    ],
    topics: [
      { name: "Dijkstra's algorithm", files: 3, depth: 3 },
      { name: "Binary heap", files: 2, depth: 2 },
      { name: "Grid traversal", files: 4, depth: 2 },
      { name: "Hash maps", files: 6, depth: 1 },
    ],
  },
} as const;

export const previewAssessment = {
  evidence: ["src/search/dijkstra.ts", "src/heap.ts"],
  requirements: [
    "Cell costs are positive integers",
    "Walls can never be entered",
    "Return null when the goal is unreachable",
    "A 200 × 200 grid resolves in under 100 ms",
  ],
} as const;

export const previewReport = {
  run: "Run 3",
  finished: "2m ago",
  score: 86,
  breakdown: [
    { label: "Correctness", value: "6 of 7 checks", ratio: 6 / 7 },
    { label: "Performance", value: "41 ms · budget 100 ms", ratio: 1 },
    { label: "Edge cases", value: "2 of 3 handled", ratio: 2 / 3 },
  ],
  determinism: [
    { label: "Runs", value: "3 of 3 identical" },
    { label: "Environment", value: "node 20.11 · no network" },
    { label: "Seed", value: "fixed" },
    { label: "Digest", value: "sha256:9f2c1e7a" },
  ],
  finding:
    "The loop exits without a return when the heap empties, so unreachable goals yield undefined.",
} as const;

/** A conventional screening question, for the Problem comparison. */
export const previewTraditional = {
  path: ["screening", "question 2 of 3"],
  timer: "38:12 left",
  bank: "question-bank / arrays / Q-0417",
  pool: 40,
  candidates: 1284,
  title: "Two numbers that add to a target",
  prompt:
    "Given an array of integers and a target, return the indices of the two numbers that add up to the target.",
  file: "solution.ts",
  lines: [
    "function twoSum(nums: number[], target: number): number[] {",
    "  // Write your solution here",
    "}",
  ],
  verdict: "Did not pass",
  cases: [
    "pass", "pass", "pass", "pass", "fail", "pass",
    "pass", "fail", "pass", "pass", "fail", "pass",
  ],
} as const;

/** What the portfolio scan records for each repository. */
export const previewProjectSignals = [
  {
    name: "pathfinder",
    stack: ["TypeScript", "Node.js", "Vitest", "Web Workers"],
    skills: [
      { name: "Graph search", evidence: "src/search/dijkstra.ts" },
      { name: "Performance tuning", evidence: "bench/grid-200.bench.ts" },
      { name: "Test design", evidence: "test/search.spec.ts" },
    ],
    depth: 3,
  },
  {
    name: "log-pipeline",
    stack: ["TypeScript", "Node.js", "Kafka", "ClickHouse"],
    skills: [
      { name: "Sliding windows", evidence: "src/metrics/window.ts" },
      { name: "Stream batching", evidence: "src/ingest/batcher.ts" },
    ],
    depth: 2,
  },
  {
    name: "edge-cache",
    stack: ["TypeScript", "Redis", "Cloudflare Workers"],
    skills: [
      { name: "Concurrency", evidence: "src/read-through.ts" },
      { name: "Cache invalidation", evidence: "src/ttl.ts" },
    ],
    depth: 3,
  },
  {
    name: "billing-api",
    stack: ["TypeScript", "Fastify", "PostgreSQL", "Zod"],
    skills: [
      { name: "API design", evidence: "src/routes/invoices.ts" },
      { name: "Data modelling", evidence: "db/migrations/014_invoices.sql" },
    ],
    depth: 2,
  },
  {
    name: "queue-worker",
    stack: ["TypeScript", "BullMQ", "Redis"],
    skills: [{ name: "Retries and backoff", evidence: "src/retry/backoff.ts" }],
    depth: 1,
  },
  {
    name: "cli-kit",
    stack: ["TypeScript", "Node.js"],
    skills: [{ name: "Argument parsing", evidence: "src/args.ts" }],
    depth: 1,
  },
] as const;

export const previewEvaluation = {
  log: [
    { tag: "pin", text: "node 20.11.1 · vitest 1.6.0 · seed 0x51f3" },
    { tag: "sandbox", text: "network off · 512 MB · 2 vCPU" },
    { tag: "run", text: "shortest-path.ts · 7 checks · 56 ms" },
  ],
  replays: [
    { id: "replay-1", label: "Replay 1", score: 86, ms: 56 },
    { id: "replay-2", label: "Replay 2", score: 86, ms: 58 },
    { id: "replay-3", label: "Replay 3", score: 86, ms: 55 },
  ],
} as const;

export const previewTierSignals: Record<TierId, string> = {
  foundation: "src/metrics/window.ts · 1 module",
  applied: "src/search/dijkstra.ts · 3 files",
  advanced: "src/read-through.ts · 4 call sites",
};

export const previewAssistant = {
  used: 2,
  limit: 5,
  messages: [
    {
      role: "you",
      text: "Why does the unreachable case give undefined instead of null?",
    },
    {
      role: "hint",
      text: "Follow the loop until the heap is empty. What runs after the while block?",
    },
    { role: "you", text: "Can you just write the fix?" },
    {
      role: "guard",
      text: "Declined. Solution code isn't shared during an assessment.",
    },
  ],
} as const;

export const previewRunHistory = [
  { id: "run-1", label: "Run 1", passed: 2, minute: 14 },
  { id: "run-2", label: "Run 2", passed: 4, minute: 26 },
  { id: "run-3", label: "Run 3", passed: 6, minute: 33 },
] as const;

export const previewTiers: readonly PreviewTier[] = [
  {
    id: "foundation",
    label: "Foundation",
    summary: "Sliding window over logs",
    minutes: 25,
    depth: 1,
    status: "passed",
    source: "log-pipeline",
    title: "Sliding window over request logs",
    prompt:
      "Return the largest number of requests that land inside any window of windowMs.",
    file: "burst-count.ts",
    lines: [
      "function burstCount(events: number[], windowMs: number) {",
      "  let best = 0",
      "  let start = 0",
      "  for (let end = 0; end < events.length; end++) {",
      "    while (events[end] - events[start] > windowMs) start++",
      "    best = Math.max(best, end - start + 1)",
      "  }",
      "  return best",
      "}",
    ],
    checks: [
      { name: "empty log returns 0", state: "pass", ms: 1 },
      { name: "single request counts once", state: "pass", ms: 1 },
      { name: "requests on the window edge", state: "pass", ms: 2 },
      { name: "zero-length window", state: "pass", ms: 1 },
      { name: "10k requests under 50 ms", state: "pass", ms: 14 },
    ],
  },
  {
    id: "applied",
    label: "Applied",
    summary: "Shortest path on a grid",
    minutes: 40,
    depth: 2,
    status: "in-progress",
    source: "pathfinder",
    title: "Shortest path across a weighted grid",
    prompt:
      "Return the lowest total cost from start to goal, or null when the goal can't be reached.",
    file: "shortest-path.ts",
    caretLine: 11,
    lines: [
      "function shortestPath(grid: Grid, start: Cell, goal: Cell) {",
      "  const dist = new Map([[key(start), 0]])",
      "  const heap = new MinHeap<Cell>(byDistance(dist), [start])",
      "  while (heap.size) {",
      "    const cell = heap.pop()!",
      "    if (same(cell, goal)) return dist.get(key(cell))!",
      "    for (const next of neighbors(grid, cell)) {",
      "      const cost = dist.get(key(cell))! + weight(grid, next)",
      "      if (cost < (dist.get(key(next)) ?? Infinity)) relax(next, cost)",
      "    }",
      "  }",
      "}",
    ],
    checks: [
      { name: "start equals goal", state: "pass", ms: 1 },
      { name: "straight corridor", state: "pass", ms: 2 },
      {
        name: "unreachable goal returns null",
        state: "fail",
        ms: 4,
        detail: "expected null, received undefined",
      },
      { name: "prefers the cheaper detour", state: "pass", ms: 3 },
      { name: "walls are never crossed", state: "pass", ms: 2 },
      { name: "ties resolve deterministically", state: "pass", ms: 3 },
      { name: "200 × 200 grid under 100 ms", state: "pass", ms: 41 },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    summary: "Concurrent read-through cache",
    minutes: 55,
    depth: 3,
    status: "not-started",
    source: "edge-cache",
    title: "Coordinate a concurrent cache",
    prompt:
      "Load each key at most once, even when many callers ask for it at the same time.",
    file: "read-through.ts",
    caretLine: 5,
    lines: [
      "const inflight = new Map<string, Promise<unknown>>()",
      "",
      "async function readThrough<T>(key: string, load: () => Promise<T>) {",
      "  // Share one pending load per key across concurrent callers.",
      "  ",
      "}",
    ],
    checks: [
      { name: "concurrent reads share one load", state: "pending" },
      { name: "loader runs once per key", state: "pending" },
      { name: "resolved value is shared", state: "pending" },
      { name: "different keys load in parallel", state: "pending" },
      { name: "rejection clears the pending entry", state: "pending" },
      { name: "retry after rejection reloads", state: "pending" },
      { name: "no pending entries after settle", state: "pending" },
      { name: "1k concurrent callers", state: "pending" },
    ],
  },
];
