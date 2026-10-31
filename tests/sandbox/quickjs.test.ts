import { describe, expect, it } from "vitest";
import { runSandboxJobs, runTests } from "@/lib/sandbox/quickjs";

const job = (id: string, code: string, timeoutMs = 1_500, language: "javascript" | "typescript" = "javascript") => ({
  id,
  language,
  code,
  timeoutMs,
});

describe("QuickJS sandbox", () => {
  it("runs TypeScript, including syntax that needs transforming", async () => {
    const [result] = await runSandboxJobs([
      job("ts", "enum Color { Red, Green }\nfunction f(x: number): number { return x * 2 }\nJSON.stringify([f(21), Color.Green])", 1_500, "typescript"),
    ]);
    expect(result).toEqual({ id: "ts", ok: true, output: "[42,1]" });
  });

  it("exposes nothing from the host", async () => {
    const [result] = await runSandboxJobs([
      job(
        "globals",
        `JSON.stringify({
          process: typeof process, require: typeof require, fetch: typeof fetch,
          setTimeout: typeof setTimeout, console: typeof console, Buffer: typeof Buffer,
          viaFunction: Function("return typeof process")(),
          viaConstructor: (function () {}).constructor("return typeof require")(),
        })`,
      ),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.values(JSON.parse(result.output))).toEqual(Array(8).fill("undefined"));
    }
  });

  it("has no module loader", async () => {
    const [result] = await runSandboxJobs([job("import", 'import("node:fs").then(() => "loaded")')]);
    // A dynamic import either throws or yields an unresolved promise; it never loads.
    expect(result.ok ? result.output : "rejected").not.toContain("loaded");
  });

  it("stops infinite loops at the deadline", async () => {
    const started = Date.now();
    const [result] = await runSandboxJobs([job("loop", "while (true) {}", 500)]);
    expect(result).toMatchObject({ ok: false, kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it("caps memory", async () => {
    // Large arrays reach the 64 MB cap in a few dozen steps, so this tests
    // the memory limit rather than the time limit (or the max string length).
    const [result] = await runSandboxJobs([
      job("mem", "const keep = []; while (true) keep.push(new Array(100000).fill(keep.length));", 10_000),
    ]);
    expect(result).toMatchObject({ ok: false, kind: "memory_limit" });
  });

  it("caps stack depth", async () => {
    const [result] = await runSandboxJobs([job("stack", "function f() { return f() } f()")]);
    expect(result).toMatchObject({ ok: false, kind: "stack_overflow" });
  });

  it("isolates jobs from each other", async () => {
    const results = await runSandboxJobs([
      job("a", "globalThis.leak = 'secret'; 'set'"),
      job("b", "typeof globalThis.leak"),
    ]);
    expect(results.map((result) => (result.ok ? result.output : result.kind))).toEqual(["set", "undefined"]);
  });

  it("keeps running after a job crashes", async () => {
    const results = await runSandboxJobs([job("boom", "while (true) {}", 300), job("after", "40 + 2")]);
    expect(results[1]).toEqual({ id: "after", ok: true, output: "42" });
  });

  it("reports compile errors", async () => {
    const [result] = await runSandboxJobs([job("syntax", "function (", 1_000, "typescript")]);
    expect(result.ok).toBe(false);
  });

  it("runs a test suite and compares results structurally", async () => {
    const run = await runTests(
      "typescript",
      "function pick(o: Record<string, number>, keys: string[]) { const r: Record<string, number> = {}; for (const k of keys.slice().reverse()) if (k in o) r[k] = o[k]; return r; }",
      "pick",
      [
        { name: "key order doesn't matter", args: [{ a: 1, b: 2, c: 3 }, ["a", "c"]], expected: { a: 1, c: 3 }, expectThrows: false, hidden: false },
        { name: "wrong value fails", args: [{ a: 1 }, ["a"]], expected: { a: 2 }, expectThrows: false, hidden: true },
        { name: "expects a throw", args: [{}, []], expected: null, expectThrows: true, hidden: true },
      ],
    );
    expect(run.ok).toBe(true);
    if (run.ok) expect(run.results.map((result) => result.passed)).toEqual([true, false, false]);
  });

  it("doesn't let solutions mutate shared test inputs", async () => {
    const run = await runTests(
      "javascript",
      "function drain(list) { const n = list.length; list.length = 0; return n; }",
      "drain",
      [
        { name: "first", args: [[1, 2, 3]], expected: 3, expectThrows: false, hidden: false },
        { name: "second", args: [[1, 2, 3]], expected: 3, expectThrows: false, hidden: false },
      ],
    );
    expect(run.ok && run.passed).toBe(2);
  });
});
