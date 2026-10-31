import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { buildJsHarness, parseHarnessOutput, type TestResult } from "@/lib/assessment/harness";
import type { TestCase } from "@/lib/assessment/schemas";

// Runs untrusted JavaScript/TypeScript in QuickJS (WebAssembly) inside a
// separate, permission-restricted Node process. Nothing here evaluates
// untrusted code in the server process. See runner/quickjs-runner.mjs for
// the isolation layers.

export type SandboxLanguage = "javascript" | "typescript";

export type SandboxJob = {
  id: string;
  language: SandboxLanguage;
  code: string;
  timeoutMs: number;
};

export type SandboxJobResult =
  | { id: string; ok: true; output: string }
  | {
      id: string;
      ok: false;
      kind: "compile_error" | "runtime_error" | "timeout" | "memory_limit" | "stack_overflow";
      error: string;
    };

export class SandboxError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SandboxError";
  }
}

const MAX_STDOUT_BYTES = 4 * 1024 * 1024;
const PROCESS_OVERHEAD_MS = 8_000;

function paths() {
  const root = process.cwd();
  return {
    runner: path.join(root, "src", "lib", "sandbox", "runner", "quickjs-runner.mjs"),
    runnerDir: path.join(root, "src", "lib", "sandbox", "runner"),
    nodeModules: path.join(root, "node_modules"),
  };
}

function permissionFlag() {
  return process.allowedNodeEnvironmentFlags.has("--permission")
    ? "--permission"
    : "--experimental-permission";
}

/** No inherited environment, so no secrets reach the sandbox process. */
function sandboxEnv() {
  const env = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot ?? "" } : {};
  return env as unknown as NodeJS.ProcessEnv;
}

/** Executes a batch of jobs in one sandbox process. */
export function runSandboxJobs(jobs: SandboxJob[]): Promise<SandboxJobResult[]> {
  if (jobs.length === 0) return Promise.resolve([]);
  const { runner, runnerDir, nodeModules } = paths();
  const budgetMs = jobs.reduce((sum, job) => sum + job.timeoutMs, 0) + PROCESS_OVERHEAD_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        permissionFlag(),
        `--allow-fs-read=${path.join(nodeModules, "*")}`,
        `--allow-fs-read=${path.join(runnerDir, "*")}`,
        "--disable-warning=ExperimentalWarning",
        "--max-old-space-size=256",
        runner,
      ],
      {
        env: sandboxEnv(),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error: Error | null, results?: SandboxJobResult[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(results ?? []);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new SandboxError(`Sandbox exceeded ${budgetMs} ms and was killed`));
    }, budgetMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_STDOUT_BYTES) {
        child.kill("SIGKILL");
        finish(new SandboxError("Sandbox output too large"));
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 4000) stderr += chunk;
    });
    child.on("error", (error) => finish(new SandboxError("Failed to start sandbox", { cause: error })));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(stdout) as { results?: SandboxJobResult[]; fatal?: string };
        if (parsed.fatal || !parsed.results) {
          finish(new SandboxError(`Sandbox failed: ${parsed.fatal ?? "no results"} ${stderr.slice(0, 500)}`));
        } else {
          finish(null, parsed.results);
        }
      } catch (error) {
        finish(new SandboxError(`Sandbox returned invalid output. ${stderr.slice(0, 500)}`, { cause: error }));
      }
    });

    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ jobs }));
  });
}

export type TestRun =
  | { ok: true; results: TestResult[]; passed: number; total: number }
  | { ok: false; kind: string; error: string };

/** Runs `code` against `tests` and reports per-test results. */
export async function runTests(
  language: SandboxLanguage,
  code: string,
  entry: string,
  tests: TestCase[],
  timeoutMs = 3_000,
): Promise<TestRun> {
  const [result] = await runSandboxJobs([
    { id: "run", language, code: buildJsHarness(code, entry, tests), timeoutMs },
  ]);
  return toTestRun(result);
}

export function toTestRun(result: SandboxJobResult): TestRun {
  if (!result.ok) return { ok: false, kind: result.kind, error: result.error };
  try {
    const results = parseHarnessOutput(result.output);
    return { ok: true, results, passed: results.filter((r) => r.passed).length, total: results.length };
  } catch (error) {
    return { ok: false, kind: "runtime_error", error: error instanceof Error ? error.message : "Bad harness output" };
  }
}

let availability: Promise<boolean> | null = null;

/** Whether the sandbox can start here (cached). */
export function isSandboxAvailable() {
  availability ??= runSandboxJobs([{ id: "ping", language: "javascript", code: "1 + 1", timeoutMs: 2_000 }])
    .then(([result]) => result?.ok === true && result.output === "2")
    .catch((error) => {
      console.error("[sandbox] unavailable", error);
      availability = null;
      return false;
    });
  return availability;
}
