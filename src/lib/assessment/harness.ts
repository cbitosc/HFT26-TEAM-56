import type { TestCase } from "@/lib/assessment/schemas";

// Test harnesses: wrap a solution and its tests into one program whose last
// expression (JS) or stdout (Python) is a JSON array of per-test results.
// Comparison is on canonical JSON (sorted keys, undefined -> null), so the
// same tests work across languages.

export type TestResult = {
  name: string;
  passed: boolean;
  actual?: string;
  message?: string;
};

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

function serialisableTests(tests: TestCase[]) {
  return tests.map(({ name, args, expected, expectThrows }) => ({ name, args, expected, expectThrows }));
}

/** JavaScript/TypeScript harness. The solution's top-level `entry` function is called once per test. */
export function buildJsHarness(code: string, entry: string, tests: TestCase[]) {
  if (!IDENTIFIER.test(entry)) throw new Error(`Invalid entry function name: ${entry}`);
  // JSON.stringify output is a valid JS literal, except that U+2028/U+2029
  // must be escaped for older parsers.
  const literal = JSON.stringify(serialisableTests(tests))
    .split(LINE_SEPARATOR).join("\\u2028")
    .split(PARAGRAPH_SEPARATOR).join("\\u2029");

  return `${code}
;(function () {
  var __tests = ${literal};
  function __canon(v) {
    if (v === undefined) return null;
    if (typeof v === "number" && !isFinite(v)) return String(v);
    if (Array.isArray(v)) return v.map(__canon);
    if (v && typeof v === "object") {
      if (typeof v.then === "function") return "[Promise]";
      var o = {};
      Object.keys(v).sort().forEach(function (k) { if (v[k] !== undefined) o[k] = __canon(v[k]); });
      return o;
    }
    return v;
  }
  var __out = [];
  for (var i = 0; i < __tests.length; i++) {
    var t = __tests[i];
    try {
      var actual = ${entry}.apply(null, JSON.parse(JSON.stringify(t.args)));
      if (t.expectThrows) {
        __out.push({ name: t.name, passed: false, message: "Expected an error to be thrown" });
      } else {
        var a = JSON.stringify(__canon(actual));
        var e = JSON.stringify(__canon(t.expected));
        __out.push({ name: t.name, passed: a === e, actual: a === undefined ? "undefined" : a.slice(0, 500) });
      }
    } catch (err) {
      __out.push({ name: t.name, passed: !!t.expectThrows, message: String((err && err.message) || err).slice(0, 300) });
    }
  }
  return JSON.stringify(__out);
})()`;
}

/** Python harness (used for prevalidating templates; prints JSON results). */
export function buildPythonHarness(code: string, entry: string, tests: TestCase[]) {
  if (!IDENTIFIER.test(entry)) throw new Error(`Invalid entry function name: ${entry}`);
  const payload = JSON.stringify(JSON.stringify(serialisableTests(tests)));
  return `${code}

import copy as __copy
import json as __json
import math as __math

def __canon(v):
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        if isinstance(v, float) and (__math.isnan(v) or __math.isinf(v)):
            return str(v)
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return v
    if isinstance(v, (list, tuple)):
        return [__canon(x) for x in v]
    if isinstance(v, dict):
        return {str(k): __canon(v[k]) for k in sorted(v, key=str)}
    return repr(v)

__results = []
for __t in __json.loads(${payload}):
    try:
        __actual = ${entry}(*__copy.deepcopy(__t["args"]))
        if __t["expectThrows"]:
            __results.append({"name": __t["name"], "passed": False, "message": "Expected an error to be raised"})
        else:
            __a = __json.dumps(__canon(__actual), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            __e = __json.dumps(__canon(__t["expected"]), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            __results.append({"name": __t["name"], "passed": __a == __e, "actual": __a[:500]})
    except Exception as __err:
        __results.append({"name": __t["name"], "passed": bool(__t["expectThrows"]), "message": str(__err)[:300]})
print(__json.dumps(__results))
`;
}

export function parseHarnessOutput(output: string): TestResult[] {
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) throw new Error("Harness output is not an array");
  return parsed.map((item) => {
    const entry = item as Record<string, unknown>;
    return {
      name: String(entry.name),
      passed: entry.passed === true,
      actual: typeof entry.actual === "string" ? entry.actual : undefined,
      message: typeof entry.message === "string" ? entry.message : undefined,
    };
  });
}
