/** Static stand-in for the landing showcase. Not loaded from an API. */

export const previewCandidate = {
  name: "Leila Okonkwo",
  initials: "LO",
  role: "Backend engineer",
  projects: 6,
  skills: ["TypeScript", "Graphs", "Systems", "APIs", "Concurrency"],
} as const;

export const previewProgress = {
  completed: 2,
  total: 5,
  stages: [
    { id: "portfolio", label: "Portfolio", state: "done" },
    { id: "challenge", label: "Challenge", state: "current" },
    { id: "review", label: "Review", state: "upcoming" },
  ],
} as const;

export const previewTiers = [
  {
    id: "foundation",
    label: "Foundation",
    summary: "Sliding window over logs",
    minutes: 25,
    depth: 1,
    checks: 5,
    title: "Sliding window over request logs",
    prompt: "Taken from the log pipeline in your portfolio.",
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
  },
  {
    id: "applied",
    label: "Applied",
    summary: "Shortest path on a grid",
    minutes: 40,
    depth: 2,
    checks: 7,
    title: "Shortest path across a weighted grid",
    prompt: "Taken from the pathfinding work in your portfolio.",
    lines: [
      "function shortestPath(grid: number[][], start: Cell, goal: Cell) {",
      "  const dist = new Map<string, number>()",
      "  const queue: Cell[] = [start]",
      "  dist.set(key(start), 0)",
      "  while (queue.length) {",
      "    const cell = queue.shift()!",
      "    if (same(cell, goal)) return dist.get(key(cell))!",
      "  }",
      "}",
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    summary: "Concurrent read-through cache",
    minutes: 55,
    depth: 3,
    checks: 8,
    title: "Coordinate a concurrent cache",
    prompt: "Taken from the systems project you shipped.",
    lines: [
      "async function readThrough<T>(key: string, load: () => Promise<T>) {",
      "  const pending = inflight.get(key)",
      "  if (pending) return pending as Promise<T>",
      "  const task = load().finally(() => inflight.delete(key))",
      "  inflight.set(key, task)",
      "  return task",
      "}",
    ],
  },
] as const;
