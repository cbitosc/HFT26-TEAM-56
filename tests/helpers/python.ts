import { spawnSync } from "node:child_process";

// Runs trusted Python (our own templates) locally to prevalidate them.
// Not a sandbox, and never used for AI-generated or candidate code.

export function findPython(): string | null {
  for (const candidate of ["python3", "python"]) {
    const result = spawnSync(candidate, ["-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim() === "3") return candidate;
  }
  return null;
}

export function runPython(python: string, program: string) {
  const result = spawnSync(python, ["-I", "-"], {
    input: program,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.status !== 0) throw new Error(`python failed: ${result.stderr}`);
  return result.stdout.trim().split("\n").pop() ?? "";
}
