import type { TestCase } from "@/lib/assessment/schemas";

// Programs that run a candidate's solution on a list of argument tuples and
// report each return value. Expected values are never put in the program:
// the sandbox only reports what the code returned, and gradeOutputs()
// compares on the server. Code that tampers with JSON, prototypes or the
// output channel can change what it reports, but can't pass a hidden test
// without producing the right value.

export const RESULT_MARKER = "__VETTED_RESULT__";
const MAX_LOG_CHARS = 8_000;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** A JSON string as a JavaScript string literal. */
function jsStringLiteral(value: string) {
  return JSON.stringify(value)
    .split(LINE_SEPARATOR).join("\\u2028")
    .split(PARAGRAPH_SEPARATOR).join("\\u2029");
}

// Captures the intrinsics it needs before the candidate's code runs, and
// shadows `console` so output is collected (QuickJS has no console at all).
// Kept on one line in front of the candidate's first line so error line
// numbers still match the editor.
const JS_PRELUDE = `const __vetted = (function (apply, stringify, parse, now, keys, isArray, str, finite) {
  var logs = [], size = 0;
  function fmt(v) { if (typeof v === "string") return v; try { var s = stringify(v); return s === undefined ? str(v) : s; } catch (e) { return str(v); } }
  function log() { if (size > ${MAX_LOG_CHARS}) return; var line = ""; for (var i = 0; i < arguments.length; i++) line += (i ? " " : "") + fmt(arguments[i]); size += line.length + 1; logs[logs.length] = line; }
  function canon(v, depth) {
    if (depth > 64) return "[Too deep]";
    if (v === undefined || typeof v === "function" || typeof v === "symbol") return undefined;
    if (typeof v === "number") return finite(v) ? v : str(v);
    if (typeof v === "bigint") return str(v);
    if (v === null || typeof v !== "object") return v;
    if (typeof v.then === "function") return "[Promise]";
    if (isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) { var x = canon(v[i], depth + 1); a[i] = x === undefined ? null : x; } return a; }
    var o = {}, k = keys(v);
    for (var j = 0; j < k.length; j++) { var y = canon(v[k[j]], depth + 1); if (y !== undefined) o[k[j]] = y; }
    return o;
  }
  function message(e) { try { return str(e && e.message !== undefined ? (e.name ? e.name + ": " : "") + e.message : e); } catch (x) { return "Error"; } }
  return {
    console: { log: log, info: log, warn: log, error: log, debug: log },
    run: function (fn, argsJson) {
      var tests = parse(argsJson), out = [];
      if (typeof fn !== "function") return stringify({ fatal: "missing_entry", results: [], logs: logs });
      for (var i = 0; i < tests.length; i++) {
        var start = now();
        try {
          var value = canon(apply(fn, undefined, tests[i]), 0);
          out[i] = { ok: true, value: stringify(value === undefined ? null : value), ms: now() - start };
        } catch (e) {
          out[i] = { ok: false, error: message(e), ms: now() - start };
        }
      }
      return stringify({ results: out, logs: logs });
    }
  };
})(Reflect.apply, JSON.stringify, JSON.parse, Date.now, Object.keys, Array.isArray, String, isFinite); const console = __vetted.console;`
  .split("\n")
  .map((line) => line.trim())
  .join(" ");

/**
 * JavaScript/TypeScript program. In QuickJS the result is the script's
 * completion value; under Node (Piston) it is also printed after a marker.
 */
export function buildJsProgram(code: string, entry: string, argsList: unknown[][]) {
  if (!IDENTIFIER.test(entry)) throw new Error(`Invalid entry function name: ${entry}`);
  const args = jsStringLiteral(JSON.stringify(argsList));
  return `${JS_PRELUDE}${code}
;(function (r) { if (typeof process !== "undefined" && process && process.stdout) process.stdout.write("\\n${RESULT_MARKER}" + r + "\\n"); return r; })(__vetted.run(typeof ${entry} === "function" ? ${entry} : undefined, ${args}));
`;
}

/** Python program; prints the result after a marker. Requires a Python sandbox (Piston). */
export function buildPythonProgram(code: string, entry: string, argsList: unknown[][]) {
  if (!IDENTIFIER.test(entry) || entry.includes("$")) throw new Error(`Invalid entry function name: ${entry}`);
  const payload = JSON.stringify(JSON.stringify(argsList));
  return `${code}


def __vetted_main():
    import json, math, sys, time

    def canon(v, depth=0):
        if depth > 64:
            return "[Too deep]"
        if isinstance(v, bool) or v is None or isinstance(v, str):
            return v
        if isinstance(v, (int, float)):
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return str(v)
            if isinstance(v, float) and v.is_integer():
                return int(v)
            return v
        if isinstance(v, (list, tuple)):
            return [canon(x, depth + 1) for x in v]
        if isinstance(v, dict):
            return {str(k): canon(x, depth + 1) for k, x in v.items()}
        return repr(v)

    fn = globals().get(${JSON.stringify(entry)})
    out = []
    if not callable(fn):
        sys.stdout.write("\\n${RESULT_MARKER}" + json.dumps({"fatal": "missing_entry", "results": [], "logs": []}) + "\\n")
        return
    for args in json.loads(${payload}):
        start = time.perf_counter()
        try:
            value = json.dumps(canon(fn(*args)), ensure_ascii=False)
            out.append({"ok": True, "value": value, "ms": (time.perf_counter() - start) * 1000})
        except (Exception, RecursionError) as err:
            out.append({"ok": False, "error": (type(err).__name__ + ": " + str(err))[:300], "ms": (time.perf_counter() - start) * 1000})
    sys.stdout.flush()
    sys.stdout.write("\\n${RESULT_MARKER}" + json.dumps({"results": out, "logs": []}) + "\\n")


__vetted_main()
`;
}

export type ProgramOutput = {
  /** One entry per argument tuple, in order. */
  results: ({ ok: true; value: string; ms: number } | { ok: false; error: string; ms: number })[];
  logs: string[];
  /** The entry function wasn't defined at the top level. */
  missingEntry: boolean;
};

/**
 * Reads a program's report: a completion value (QuickJS) or the text after
 * the last marker in stdout (Piston). Anything printed before the marker is
 * the candidate's own output. Returns null when there is no well-formed report.
 */
export function parseProgramOutput(raw: string, expectedCount: number): ProgramOutput | null {
  const index = raw.lastIndexOf(RESULT_MARKER);
  const printed = index === -1 ? "" : raw.slice(0, index).replace(/\n$/, "");
  const body = (index === -1 ? raw : raw.slice(index + RESULT_MARKER.length)).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.split("\n")[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const report = parsed as { fatal?: unknown; results?: unknown; logs?: unknown };
  const logs = [
    ...(printed.trim() ? printed.split("\n") : []),
    ...(Array.isArray(report.logs) ? report.logs.map(String) : []),
  ];
  const clippedLogs: string[] = [];
  let size = 0;
  for (const line of logs) {
    if (size > MAX_LOG_CHARS) break;
    clippedLogs.push(line.slice(0, 1_000));
    size += line.length;
  }

  if (report.fatal === "missing_entry") return { results: [], logs: clippedLogs, missingEntry: true };
  if (!Array.isArray(report.results) || report.results.length !== expectedCount) return null;

  const results: ProgramOutput["results"] = [];
  for (const item of report.results) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const ms = typeof entry.ms === "number" && Number.isFinite(entry.ms) && entry.ms >= 0 ? entry.ms : 0;
    if (entry.ok === true && typeof entry.value === "string") results.push({ ok: true, value: entry.value, ms });
    else results.push({ ok: false, error: typeof entry.error === "string" ? entry.error.slice(0, 300) : "Error", ms });
  }
  return { results, logs: clippedLogs, missingEntry: false };
}

/** JSON with sorted keys; -0 and 0 compare equal. The comparison format for test values. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? "null";
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export type GradedTest = {
  name: string;
  hidden: boolean;
  passed: boolean;
  /** What the code returned, as JSON (truncated). */
  actual?: string;
  /** The error the code threw. */
  error?: string;
  ms: number;
};

/** Compares reported values with the expected ones. Deterministic; runs on the server. */
export function gradeOutputs(tests: TestCase[], output: ProgramOutput): GradedTest[] {
  return tests.map((test, index) => {
    const result = output.results[index];
    if (!result) return { name: test.name, hidden: test.hidden, passed: false, error: "No result", ms: 0 };
    const ms = Math.round(result.ms * 100) / 100;
    if (!result.ok) {
      return { name: test.name, hidden: test.hidden, passed: test.expectThrows, error: result.error, ms };
    }
    if (test.expectThrows) {
      return { name: test.name, hidden: test.hidden, passed: false, actual: result.value.slice(0, 500), error: "Expected an error to be thrown", ms };
    }
    let actual: unknown;
    try {
      actual = JSON.parse(result.value);
    } catch {
      return { name: test.name, hidden: test.hidden, passed: false, error: "Return value isn't serialisable", ms };
    }
    return {
      name: test.name,
      hidden: test.hidden,
      passed: canonicalJson(actual) === canonicalJson(test.expected),
      actual: result.value.slice(0, 500),
      ms,
    };
  });
}
