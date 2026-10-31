import "server-only";
import { stripTypeScriptTypes } from "node:module";
import type { CodeLanguage } from "@/lib/assessment/config";
import type { TestCase } from "@/lib/assessment/schemas";
import {
  buildJsProgram,
  buildPythonProgram,
  gradeOutputs,
  parseProgramOutput,
  type GradedTest,
  type ProgramOutput,
} from "@/lib/execution/program";
import { PistonError, pistonConfig, runOnPiston, type PistonRun } from "@/lib/execution/piston";
import { SandboxError, runSandboxJobs, type SandboxJobResult } from "@/lib/sandbox/quickjs";

// Runs candidate code against test cases in an isolated sandbox and grades
// the results on the server. Never evaluates candidate code in this process.
//
//   Piston (PISTON_URL set): every language, in a separate container service.
//   QuickJS (fallback): JavaScript/TypeScript only, in a WebAssembly
//   interpreter inside a separate, permission-restricted process.

export type ExecutionOutcome =
  | "passed"
  | "failed"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "memory_limit"
  | "output_limit";

export type ExecutionRuntime = "piston" | "quickjs-wasm";

export type ExecutionReport = {
  runtime: ExecutionRuntime;
  outcome: ExecutionOutcome;
  tests: GradedTest[];
  passed: number;
  total: number;
  /** Time spent inside the solution across all tests, measured in the sandbox. */
  executionTimeMs: number | null;
  /** The candidate's console / print output. */
  logs: string[];
  /** Compiler or runtime error, when the program didn't produce results. */
  error: string | null;
};

/** No sandbox can run this language here. Not the candidate's fault; nothing is recorded. */
export class ExecutionUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExecutionUnavailableError";
  }
}

const QUICKJS_TIMEOUT_MS = 3_000;

export function executionBackend(language: CodeLanguage): ExecutionRuntime | null {
  if (pistonConfig()) return "piston";
  return language === "python" ? null : "quickjs-wasm";
}

function isSyntaxError(message: string) {
  return /\b(SyntaxError|IndentationError|TabError)\b/.test(message);
}

/** The last few lines of an error output, where the actual message is. */
function tail(text: string, lines = 8) {
  return text.trim().split("\n").slice(-lines).join("\n").slice(0, 2_000);
}

function failure(runtime: ExecutionRuntime, outcome: ExecutionOutcome, tests: TestCase[], error: string, logs: string[] = []): ExecutionReport {
  return {
    runtime,
    outcome,
    tests: tests.map((test) => ({ name: test.name, hidden: test.hidden, passed: false, ms: 0 })),
    passed: 0,
    total: tests.length,
    executionTimeMs: null,
    logs,
    error,
  };
}

function report(runtime: ExecutionRuntime, tests: TestCase[], output: ProgramOutput, entry: string): ExecutionReport {
  if (output.missingEntry) {
    return failure(runtime, "runtime_error", tests, `Define a top-level function named ${entry}.`, output.logs);
  }
  const graded = gradeOutputs(tests, output);
  const passed = graded.filter((test) => test.passed).length;
  const executionTimeMs = Math.round(graded.reduce((sum, test) => sum + test.ms, 0));
  return {
    runtime,
    outcome: passed === graded.length ? "passed" : "failed",
    tests: graded,
    passed,
    total: graded.length,
    executionTimeMs,
    logs: output.logs,
    error: null,
  };
}

async function runQuickJs(language: "javascript" | "typescript", program: string, tests: TestCase[], entry: string) {
  let result: SandboxJobResult;
  try {
    [result] = await runSandboxJobs([{ id: "exec", language, code: program, timeoutMs: QUICKJS_TIMEOUT_MS }]);
  } catch (error) {
    throw new ExecutionUnavailableError(error instanceof SandboxError ? error.message : "Sandbox failed", { cause: error });
  }
  if (!result.ok) {
    const outcome: ExecutionOutcome =
      result.kind === "compile_error" || isSyntaxError(result.error)
        ? "compile_error"
        : result.kind === "timeout"
          ? "timeout"
          : result.kind === "memory_limit"
            ? "memory_limit"
            : "runtime_error";
    const message =
      outcome === "timeout"
        ? `Stopped after ${QUICKJS_TIMEOUT_MS / 1000} s. Check for infinite loops.`
        : outcome === "memory_limit"
          ? "Ran out of memory."
          : result.kind === "stack_overflow"
            ? "Maximum call stack size exceeded."
            : result.error;
    return failure("quickjs-wasm", outcome, tests, message);
  }
  const output = parseProgramOutput(result.output, tests.length);
  if (!output) return failure("quickjs-wasm", "runtime_error", tests, "The program didn't report results.");
  return report("quickjs-wasm", tests, output, entry);
}

async function runPiston(language: CodeLanguage, program: string, tests: TestCase[], entry: string) {
  let source = program;
  if (language === "typescript") {
    // Type stripping is a source transform, not execution; the result runs on Piston as JavaScript.
    try {
      source = stripTypeScriptTypes(program, { mode: "transform", sourceUrl: "solution.ts" });
    } catch (error) {
      return failure("piston", "compile_error", tests, error instanceof Error ? error.message.slice(0, 2_000) : "Invalid TypeScript");
    }
  }

  let run: PistonRun;
  try {
    run = await runOnPiston(language === "python" ? "python" : "javascript", source);
  } catch (error) {
    throw new ExecutionUnavailableError(error instanceof PistonError ? error.message : "Execution failed", { cause: error });
  }

  const limit = pistonConfig()?.runTimeoutMs ?? 3_000;
  if (run.status === "TO") return failure("piston", "timeout", tests, `Stopped after ${limit / 1000} s. Check for infinite loops.`);
  if (run.status === "OL" || run.status === "EL") return failure("piston", "output_limit", tests, "Printed too much output.");

  const output = parseProgramOutput(run.stdout, tests.length);
  if (output) return report("piston", tests, output, entry);

  if (run.signal === "SIGKILL") {
    return (run.wallMs ?? 0) >= limit * 0.9
      ? failure("piston", "timeout", tests, `Stopped after ${limit / 1000} s. Check for infinite loops.`)
      : failure("piston", "memory_limit", tests, "Ran out of memory.");
  }
  const stderr = tail(run.stderr) || "The program exited without reporting results.";
  const logs = run.stdout.trim() ? run.stdout.trim().split("\n").slice(-50) : [];
  return failure("piston", isSyntaxError(run.stderr) ? "compile_error" : "runtime_error", tests, stderr, logs);
}

/** Runs `code` on every test's arguments and grades the return values. */
export async function executeTests({
  language,
  code,
  entry,
  tests,
}: {
  language: CodeLanguage;
  code: string;
  entry: string;
  tests: TestCase[];
}): Promise<ExecutionReport> {
  const backend = executionBackend(language);
  if (!backend) {
    throw new ExecutionUnavailableError(`No sandbox is configured for ${language}. Set PISTON_URL to run it.`);
  }
  const argsList = tests.map((test) => test.args);
  if (language === "python") return runPiston(language, buildPythonProgram(code, entry, argsList), tests, entry);
  const program = buildJsProgram(code, entry, argsList);
  return backend === "piston" ? runPiston(language, program, tests, entry) : runQuickJs(language, program, tests, entry);
}
