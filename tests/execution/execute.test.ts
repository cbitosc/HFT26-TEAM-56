import { afterEach, describe, expect, it, vi } from "vitest";
import type { TestCase } from "@/lib/assessment/schemas";
import { executeTests } from "@/lib/execution/execute";
import { buildJsProgram, buildPythonProgram, canonicalJson, gradeOutputs, parseProgramOutput, RESULT_MARKER } from "@/lib/execution/program";
import { findPython, runPython } from "../helpers/python";

// Candidate code execution end to end in the real QuickJS sandbox (no
// PISTON_URL), plus the Piston path with the service mocked.

const tests: TestCase[] = [
  { name: "sums", args: [[1, 2, 3]], expected: 6, expectThrows: false, hidden: false },
  { name: "empty", args: [[]], expected: 0, expectThrows: false, hidden: false },
  { name: "negative", args: [[-4, 1]], expected: -3, expectThrows: false, hidden: true },
  { name: "rejects non-arrays", args: ["nope"], expected: null, expectThrows: true, hidden: true },
];

const correct = `function total(values: number[]): number {
  if (!Array.isArray(values)) throw new TypeError("values must be an array");
  console.log("summing", values.length, { values });
  return values.reduce((sum, value) => sum + value, 0);
}`;

const run = (code: string, language: "typescript" | "javascript" = "typescript", cases = tests) =>
  executeTests({ language, code, entry: "total", tests: cases });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("program output", () => {
  it("never puts expected values into the program", () => {
    const secret: TestCase[] = [{ name: "h", args: [1], expected: "EXPECTED-SECRET-VALUE", expectThrows: false, hidden: true }];
    expect(buildJsProgram("function f(x){return x}", "f", secret.map((t) => t.args))).not.toContain("EXPECTED-SECRET-VALUE");
    expect(buildPythonProgram("def f(x):\n    return x", "f", secret.map((t) => t.args))).not.toContain("EXPECTED-SECRET-VALUE");
  });

  it("keeps the candidate's first line on line 1", () => {
    const program = buildJsProgram("function f() {}", "f", []);
    expect(program.split("\n")[0].endsWith("function f() {}")).toBe(true);
  });

  it("compares values canonically (key order, -0)", () => {
    expect(canonicalJson({ b: 1, a: [-0, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [0, { c: 2, d: 1 }], b: 1 }));
  });

  it("uses the last report after the marker and keeps earlier output as logs", () => {
    const raw = `hello\n${RESULT_MARKER}{"results":[{"ok":true,"value":"1","ms":1}],"logs":[]}\nfake\n${RESULT_MARKER}{"results":[{"ok":true,"value":"2","ms":1}],"logs":["x"]}\n`;
    const output = parseProgramOutput(raw, 1)!;
    expect(output.results[0]).toMatchObject({ value: "2" });
    expect(output.logs).toContain("hello");
    expect(parseProgramOutput(raw, 2)).toBeNull();
  });

  it("grades a reported value against the expected one on the server", () => {
    const graded = gradeOutputs(tests.slice(0, 2), {
      results: [{ ok: true, value: "6", ms: 1 }, { ok: true, value: "1", ms: 1 }],
      logs: [],
      missingEntry: false,
    });
    expect(graded.map((test) => test.passed)).toEqual([true, false]);
  });
});

describe("QuickJS execution", () => {
  it("runs a correct TypeScript solution and captures console output", async () => {
    const result = await run(correct);
    expect(result).toMatchObject({ runtime: "quickjs-wasm", outcome: "passed", passed: 4, total: 4, error: null });
    expect(result.logs[0]).toBe('summing 3 {"values":[1,2,3]}');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic", async () => {
    const wrong = "function total(values) { return values.length; }";
    const first = await run(wrong, "javascript");
    const second = await run(wrong, "javascript");
    expect(first.tests.map((t) => t.passed)).toEqual(second.tests.map((t) => t.passed));
    // Only the empty-array case happens to match.
    expect(first).toMatchObject({ outcome: "failed", passed: 1 });
  });

  it("reports compile errors, runtime errors, a missing entry and timeouts", async () => {
    expect((await run("function total(values { return 1 }", "javascript")).outcome).toBe("compile_error");
    const thrown = await run("function total() { return undefinedThing.x; }", "javascript");
    expect(thrown.outcome).toBe("failed");
    expect(thrown.tests[0].error).toMatch(/ReferenceError/);
    expect(thrown.tests[3].passed).toBe(true);
    expect(await run("function other() {}", "javascript")).toMatchObject({ outcome: "runtime_error", error: expect.stringMatching(/total/) });
    expect((await run("function total() { while (true) {} }", "javascript")).outcome).toBe("timeout");
  });

  it("can't fake passing results by tampering with the runtime", async () => {
    const attacks = [
      // Overwrite serialisation, prototypes and the reporting channel.
      `JSON.stringify = function () { return '{"results":[{"ok":true,"value":"0","ms":0}],"logs":[]}'; };
       Object.prototype.toJSON = function () { return 0; };
       Array.prototype.toJSON = function () { return 0; };
       function total() { return 0; }`,
      // Print a forged report and stop.
      `function total() { return 0; }
       "${RESULT_MARKER}{\\"results\\":[{\\"ok\\":true,\\"value\\":\\"6\\",\\"ms\\":0}]}";`,
      // Return a value that pretends to be equal to anything.
      `function total() { return new Proxy({}, { get: () => 6, ownKeys: () => [] }); }`,
    ];
    for (const code of attacks) {
      const result = await run(code, "javascript");
      expect(result.passed, code).toBeLessThan(4);
      // The hidden value test ("negative") needs the right value; it can never be faked.
      expect(result.tests.find((t) => t.name === "negative")?.passed).toBe(false);
    }
  });

  it("refuses Python without a Python sandbox", async () => {
    await expect(executeTests({ language: "python", code: "def total(v): return 0", entry: "total", tests })).rejects.toThrow(/PISTON_URL/);
  });
});

describe("Piston execution", () => {
  it("sends the program to Piston with limits and grades its report", async () => {
    vi.stubEnv("PISTON_URL", "https://piston.internal/");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({ language: "javascript", run_timeout: 3000, run_memory_limit: 256 * 1024 * 1024 });
      // TypeScript is stripped before it's sent.
      expect(body.files[0].content).not.toContain(": number[]");
      const report = { results: [6, 0, -3].map((value) => ({ ok: true, value: String(value), ms: 0.5 })).concat([{ ok: false, error: "TypeError", ms: 0 }] as never), logs: ["hi"] };
      return new Response(JSON.stringify({ run: { stdout: `debug\n${RESULT_MARKER}${JSON.stringify(report)}\n`, stderr: "", code: 0, signal: null, status: null, wall_time: 40 } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await run(correct);
    expect(fetchMock).toHaveBeenCalledWith("https://piston.internal/api/v2/execute", expect.anything());
    expect(result).toMatchObject({ runtime: "piston", outcome: "passed", passed: 4, executionTimeMs: 2 });
    expect(result.logs).toEqual(["debug", "hi"]);
  });

  it("maps Piston limits and errors", async () => {
    vi.stubEnv("PISTON_URL", "https://piston.internal");
    const respond = (run: Record<string, unknown>) =>
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ run: { stdout: "", stderr: "", code: 1, signal: null, status: null, ...run } }))));
    respond({ status: "TO", signal: "SIGKILL" });
    expect((await run(correct)).outcome).toBe("timeout");
    respond({ stderr: '  File "main.py", line 1\nSyntaxError: invalid syntax' });
    expect((await executeTests({ language: "python", code: "def total(:", entry: "total", tests })).outcome).toBe("compile_error");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(run(correct)).rejects.toThrow(/503/);
  });
});

describe.runIf(findPython())("Python program", () => {
  it("reports return values the same way as the JavaScript program", () => {
    const code = "def total(values):\n    if not isinstance(values, list):\n        raise TypeError('values must be a list')\n    print('summing')\n    return sum(values)\n";
    const output = parseProgramOutput(runPythonRaw(code), tests.length)!;
    expect(output.logs).toContain("summing");
    expect(gradeOutputs(tests, output).every((test) => test.passed)).toBe(true);
  });
});

function runPythonRaw(code: string) {
  const python = findPython()!;
  // runPython returns the last line, which is the report.
  return `${RESULT_MARKER}${runPython(python, buildPythonProgram(code, "total", tests.map((t) => t.args))).split(RESULT_MARKER).pop()}`.replace(
    RESULT_MARKER,
    "summing\n" + RESULT_MARKER,
  );
}
