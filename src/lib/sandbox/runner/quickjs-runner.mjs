// Sandbox worker process. Spawned by src/lib/sandbox/quickjs.ts, never
// imported by the app. Reads a batch of jobs as JSON on stdin and writes
// results as JSON on stdout.
//
// Isolation layers:
//  1. This runs in its own OS process, started with Node's permission model
//     (no child processes, workers, native addons, WASI or file writes; file
//     reads limited to the QuickJS package) and an empty environment.
//  2. Untrusted code runs inside QuickJS compiled to WebAssembly. The guest
//     gets a bare JavaScript context: no require/import, process, fetch,
//     timers, filesystem or network. Nothing from the host is exposed.
//  3. Each job gets a fresh WebAssembly module and runtime with a memory
//     cap, stack cap and a deadline enforced by an interrupt handler, so one
//     job can't affect the next. The parent also kills this process if it
//     overruns.
import { stripTypeScriptTypes } from "node:module";
import { RELEASE_SYNC, newQuickJSWASMModule, shouldInterruptAfterDeadline } from "quickjs-emscripten";

const MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const STACK_LIMIT_BYTES = 1024 * 1024;
const MAX_OUTPUT_CHARS = 200_000;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function toJavaScript(job) {
  if (job.language !== "typescript") return job.code;
  return stripTypeScriptTypes(job.code, { mode: "transform", sourceUrl: "solution.ts" });
}

async function runJob(job) {
  let source;
  try {
    source = toJavaScript(job);
  } catch (error) {
    return { id: job.id, ok: false, kind: "compile_error", error: String(error?.message ?? error).slice(0, 2000) };
  }

  const QuickJS = await newQuickJSWASMModule(RELEASE_SYNC);
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(STACK_LIMIT_BYTES);
  const deadline = Date.now() + job.timeoutMs;
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));
  const vm = runtime.newContext();

  try {
    const result = vm.evalCode(source, "solution.js");
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      const message = typeof error === "object" && error ? `${error.name ?? "Error"}: ${error.message ?? ""}` : String(error);
      return { id: job.id, ok: false, kind: classify(message, deadline), error: message.slice(0, 2000) };
    }
    const value = vm.dump(result.value);
    result.value.dispose();
    const output = typeof value === "string" ? value : JSON.stringify(value ?? null);
    vm.dispose();
    runtime.dispose();
    return { id: job.id, ok: true, output: output.slice(0, MAX_OUTPUT_CHARS) };
  } catch (error) {
    // Engine-level failures surface as host exceptions.
    const message = String(error?.message ?? error);
    return { id: job.id, ok: false, kind: classify(message, deadline), error: message.slice(0, 2000) };
  }
  // After a failed job the runtime is deliberately not freed: QuickJS can
  // assert while freeing a runtime that died mid-allocation. The module is
  // per-job and the process is short-lived, so nothing leaks past the batch.
}

function classify(message, deadline) {
  if (/out of memory/i.test(message)) return "memory_limit";
  if (/interrupted/i.test(message) || Date.now() >= deadline) return "timeout";
  if (/stack size exceeded/i.test(message)) return "stack_overflow";
  return "runtime_error";
}

try {
  const { jobs } = JSON.parse(await readStdin());
  const results = [];
  for (const job of jobs) results.push(await runJob(job));
  process.stdout.write(JSON.stringify({ results }));
} catch (error) {
  process.stdout.write(JSON.stringify({ fatal: String(error?.message ?? error) }));
  process.exitCode = 1;
}
