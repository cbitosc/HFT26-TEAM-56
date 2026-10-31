import type { PracticalType, Tier } from "@/lib/assessment/config";
import type { TestCase } from "@/lib/assessment/schemas";

// Prevalidated practical challenges. Used when a candidate's languages can't
// be executed in the sandbox (e.g. Python) or when AI-generated practical
// questions fail validation after the retry budget. Only the narrative is
// personalised (project context); code and tests are fixed, and every
// template is verified by tests/assessment/templates.test.ts: the reference
// passes all tests and the starter fails at least one, in both languages.

export type TemplateLanguage = "typescript" | "python";

export type ChallengeTemplate = {
  id: string;
  tier: Tier;
  type: PracticalType;
  title: string;
  /** Statement body; `context` is a one-sentence, résumé-derived framing. */
  statement: (context: string, language: TemplateLanguage) => string;
  /** Words that tie the task to a project, for picking the framing project. */
  keywords: string[];
  entry: Record<TemplateLanguage, string>;
  starter: Record<TemplateLanguage, string>;
  reference: Record<TemplateLanguage, string>;
  tests: TestCase[];
};

function t(name: string, args: unknown[], expected: unknown, hidden: boolean, expectThrows = false): TestCase {
  return { name, args, expected, expectThrows, hidden };
}

const summarizeTotals: ChallengeTemplate = {
  id: "summarize-totals",
  keywords: ["aggregate", "report", "total", "analytics", "dashboard", "group by"],
  tier: "novice",
  type: "coding",
  title: "Summarise totals by key",
  statement: (context, language) => `${context}

Implement \`${language === "python" ? "summarize_totals" : "summarizeTotals"}(records, key, field)\`. It receives a list of records (objects / dicts), the name of a grouping key and the name of a numeric field, and returns an object mapping each group to the sum of that field.

Rules:
- Group by the string form of \`record[key]\` (e.g. \`1\` becomes \`"1"\`).
- Skip records whose key is missing or null.
- Skip values that are not numbers (strings like "7" and booleans don't count).
- An empty input returns an empty object.`,
  entry: { typescript: "summarizeTotals", python: "summarize_totals" },
  starter: {
    typescript: `function summarizeTotals(
  records: Array<Record<string, unknown>>,
  key: string,
  field: string,
): Record<string, number> {
  // TODO: group records by key and sum the numeric field.
  throw new Error("Not implemented");
}
`,
    python: `def summarize_totals(records, key, field):
    # TODO: group records by key and sum the numeric field.
    raise NotImplementedError("Not implemented")
`,
  },
  reference: {
    typescript: `function summarizeTotals(
  records: Array<Record<string, unknown>>,
  key: string,
  field: string,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const record of records) {
    const group = record[key];
    const value = record[field];
    if (group === undefined || group === null) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const name = String(group);
    totals[name] = (totals[name] ?? 0) + value;
  }
  return totals;
}
`,
    python: `def summarize_totals(records, key, field):
    totals = {}
    for record in records:
        group = record.get(key)
        value = record.get(field)
        if group is None:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        name = str(group)
        totals[name] = totals.get(name, 0) + value
    return totals
`,
  },
  tests: [
    t("groups and sums", [[{ team: "a", points: 3 }, { team: "b", points: 5 }, { team: "a", points: 4 }], "team", "points"], { a: 7, b: 5 }, false),
    t("empty input", [[], "team", "points"], {}, false),
    t("skips missing and null keys", [[{ team: "a", points: 2 }, { points: 9 }, { team: null, points: 1 }], "team", "points"], { a: 2 }, true),
    t("skips non-numeric values", [[{ team: "a", points: "7" }, { team: "a", points: 1 }, { team: "a", points: true }], "team", "points"], { a: 1 }, true),
    t("numeric keys become strings", [[{ id: 1, n: 2 }, { id: 1, n: 3 }, { id: 2, n: 0 }], "id", "n"], { "1": 5, "2": 0 }, true),
    t("handles negative values", [[{ k: "x", v: -4 }, { k: "x", v: 10 }], "k", "v"], { x: 6 }, true),
  ],
};

const paginate: ChallengeTemplate = {
  id: "paginate",
  keywords: ["pagination", "paginated", "page size", "list endpoint", "cursor"],
  tier: "adept",
  type: "coding",
  title: "Paginate an API result set",
  statement: (context, language) => `${context}

Implement \`paginate(items, page, ${language === "python" ? "page_size" : "pageSize"})\` for a list endpoint. Return:

\`{ items, page, pageSize, totalItems, totalPages, hasNext, hasPrevious }\`

Rules:
- \`page\` is 1-based. It must be an integer >= 1, otherwise ${language === "python" ? "raise ValueError" : "throw an Error"}.
- The page size must be an integer from 1 to 100, otherwise ${language === "python" ? "raise ValueError" : "throw an Error"}.
- \`totalPages\` is 0 when there are no items.
- A page past the end returns an empty \`items\` list (not an error).
- \`hasNext\` is true when \`page < totalPages\`; \`hasPrevious\` is true when \`page > 1\`.`,
  entry: { typescript: "paginate", python: "paginate" },
  starter: {
    typescript: `type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  // TODO: validate the input and return the requested page.
  throw new Error("Not implemented");
}
`,
    python: `def paginate(items, page, page_size):
    # TODO: validate the input and return the requested page as a dict with
    # items, page, pageSize, totalItems, totalPages, hasNext, hasPrevious.
    raise NotImplementedError("Not implemented")
`,
  },
  reference: {
    typescript: `type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  if (!Number.isInteger(page) || page < 1) throw new Error("page must be an integer >= 1");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("pageSize must be an integer between 1 and 100");
  }
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}
`,
    python: `import math


def paginate(items, page, page_size):
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        raise ValueError("page must be an integer >= 1")
    if isinstance(page_size, bool) or not isinstance(page_size, int) or not 1 <= page_size <= 100:
        raise ValueError("page_size must be an integer between 1 and 100")
    total_items = len(items)
    total_pages = math.ceil(total_items / page_size)
    start = (page - 1) * page_size
    return {
        "items": items[start:start + page_size],
        "page": page,
        "pageSize": page_size,
        "totalItems": total_items,
        "totalPages": total_pages,
        "hasNext": page < total_pages,
        "hasPrevious": page > 1,
    }
`,
  },
  tests: [
    t("first page", [[1, 2, 3, 4, 5], 1, 2], { items: [1, 2], page: 1, pageSize: 2, totalItems: 5, totalPages: 3, hasNext: true, hasPrevious: false }, false),
    t("last partial page", [[1, 2, 3, 4, 5], 3, 2], { items: [5], page: 3, pageSize: 2, totalItems: 5, totalPages: 3, hasNext: false, hasPrevious: true }, false),
    t("page past the end", [["a", "b"], 5, 10], { items: [], page: 5, pageSize: 10, totalItems: 2, totalPages: 1, hasNext: false, hasPrevious: true }, true),
    t("empty result set", [[], 1, 10], { items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false }, true),
    t("rejects page 0", [[1, 2, 3], 0, 2], null, true, true),
    t("rejects page size over 100", [[1, 2, 3], 1, 101], null, true, true),
    t("rejects fractional page", [[1, 2, 3], 1.5, 2], null, true, true),
  ],
};

const parseQuery: ChallengeTemplate = {
  id: "parse-query",
  keywords: ["query string", "query param", "querystring", "url", "search param"],
  tier: "adept",
  type: "debugging",
  title: "Fix the query-string parser",
  statement: (context, language) => `${context}

\`${language === "python" ? "parse_query" : "parseQuery"}(qs)\` turns a URL query string into an object, but users report wrong results. Fix it so that:

- A leading \`?\` is ignored, and empty segments (e.g. from \`&&\`) are skipped.
- Only the first \`=\` separates key and value (\`token=abc==\` gives \`"abc=="\`).
- A segment without \`=\` has the value \`""\`.
- Keys and values are URL-decoded, and \`+\` means a space.
- Repeated keys collect their values into an array, in order.`,
  entry: { typescript: "parseQuery", python: "parse_query" },
  starter: {
    typescript: `function parseQuery(qs: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const part of qs.split("&")) {
    const [key, value] = part.split("=");
    result[key] = decodeURIComponent(value);
  }
  return result;
}
`,
    python: `from urllib.parse import unquote


def parse_query(qs):
    result = {}
    for part in qs.split("&"):
        pieces = part.split("=")
        result[pieces[0]] = unquote(pieces[1])
    return result
`,
  },
  reference: {
    typescript: `function decodeComponent(text: string): string {
  return decodeURIComponent(text.replace(/\\+/g, " "));
}

function parseQuery(qs: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const query = qs.startsWith("?") ? qs.slice(1) : qs;
  for (const part of query.split("&")) {
    if (part === "") continue;
    const index = part.indexOf("=");
    const key = decodeComponent(index === -1 ? part : part.slice(0, index));
    const value = decodeComponent(index === -1 ? "" : part.slice(index + 1));
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else result[key] = [existing, value];
  }
  return result;
}
`,
    python: `from urllib.parse import unquote_plus


def parse_query(qs):
    result = {}
    query = qs[1:] if qs.startswith("?") else qs
    for part in query.split("&"):
        if part == "":
            continue
        raw_key, _, raw_value = part.partition("=")
        key = unquote_plus(raw_key)
        value = unquote_plus(raw_value)
        if key not in result:
            result[key] = value
        elif isinstance(result[key], list):
            result[key].append(value)
        else:
            result[key] = [result[key], value]
    return result
`,
  },
  tests: [
    t("simple pairs", ["a=1&b=2"], { a: "1", b: "2" }, false),
    t("leading ? and plus as space", ["?q=hello+world&lang=en"], { q: "hello world", lang: "en" }, false),
    t("repeated keys become arrays", ["tag=a&tag=b&tag=c"], { tag: ["a", "b", "c"] }, true),
    t("only the first = splits", ["token=abc==&x=%3D"], { token: "abc==", x: "=" }, true),
    t("flags, empty values and unicode", ["flag&empty=&&name=J%C3%BCrgen"], { flag: "", empty: "", name: "Jürgen" }, true),
    t("empty string", [""], {}, true),
    t("lone question mark", ["?"], {}, true),
  ],
};

const tokenBucket: ChallengeTemplate = {
  id: "token-bucket",
  keywords: ["rate limit", "rate-limit", "throttl", "quota", "token bucket", "token-bucket"],
  tier: "master",
  type: "coding",
  title: "Per-client token-bucket rate limiter",
  statement: (context, language) => `${context}

Implement \`${language === "python" ? "allow_requests(requests, capacity, refill_interval_ms)" : "allowRequests(requests, capacity, refillIntervalMs)"}\`. \`requests\` is a list of \`{ clientId, at }\` objects in non-decreasing \`at\` order (milliseconds). Return a list of booleans: whether each request is allowed.

Each client has its own bucket:
- A bucket starts full (\`capacity\` tokens). Its refill clock starts at the client's first request.
- Before handling a request at time \`t\`, add \`n = floor((t - lastRefill) / interval)\` tokens (never above \`capacity\`), then advance \`lastRefill\` by \`n * interval\`. Don't reset it to \`t\`. (\`interval\` is the refill interval argument.)
- If the bucket has at least one token, allow the request and remove a token. Otherwise deny it.
- \`capacity\` and the refill interval must be integers >= 1, otherwise ${language === "python" ? "raise ValueError" : "throw an Error"}.`,
  entry: { typescript: "allowRequests", python: "allow_requests" },
  starter: {
    typescript: `type RateLimitedRequest = { clientId: string; at: number };

function allowRequests(
  requests: RateLimitedRequest[],
  capacity: number,
  refillIntervalMs: number,
): boolean[] {
  // TODO: keep a token bucket per client and decide each request.
  throw new Error("Not implemented");
}
`,
    python: `def allow_requests(requests, capacity, refill_interval_ms):
    # TODO: keep a token bucket per client and decide each request.
    raise NotImplementedError("Not implemented")
`,
  },
  reference: {
    typescript: `type RateLimitedRequest = { clientId: string; at: number };
type Bucket = { tokens: number; lastRefill: number };

function allowRequests(
  requests: RateLimitedRequest[],
  capacity: number,
  refillIntervalMs: number,
): boolean[] {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be an integer >= 1");
  if (!Number.isInteger(refillIntervalMs) || refillIntervalMs < 1) {
    throw new Error("refillIntervalMs must be an integer >= 1");
  }
  const buckets = new Map<string, Bucket>();
  return requests.map(({ clientId, at }) => {
    let bucket = buckets.get(clientId);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: at };
      buckets.set(clientId, bucket);
    }
    const refills = Math.floor((at - bucket.lastRefill) / refillIntervalMs);
    if (refills > 0) {
      bucket.tokens = Math.min(capacity, bucket.tokens + refills);
      bucket.lastRefill += refills * refillIntervalMs;
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  });
}
`,
    python: `def allow_requests(requests, capacity, refill_interval_ms):
    if isinstance(capacity, bool) or not isinstance(capacity, int) or capacity < 1:
        raise ValueError("capacity must be an integer >= 1")
    if isinstance(refill_interval_ms, bool) or not isinstance(refill_interval_ms, int) or refill_interval_ms < 1:
        raise ValueError("refill_interval_ms must be an integer >= 1")
    buckets = {}
    decisions = []
    for request in requests:
        client, at = request["clientId"], request["at"]
        bucket = buckets.setdefault(client, {"tokens": capacity, "last_refill": at})
        refills = (at - bucket["last_refill"]) // refill_interval_ms
        if refills > 0:
            bucket["tokens"] = min(capacity, bucket["tokens"] + refills)
            bucket["last_refill"] += refills * refill_interval_ms
        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            decisions.append(True)
        else:
            decisions.append(False)
    return decisions
`,
  },
  tests: [
    t("burst up to capacity", [[{ clientId: "a", at: 0 }, { clientId: "a", at: 0 }, { clientId: "a", at: 0 }], 2, 1000], [true, true, false], false),
    t("refills after an interval", [[{ clientId: "a", at: 0 }, { clientId: "a", at: 0 }, { clientId: "a", at: 1000 }], 1, 1000], [true, false, true], false),
    t("clients are independent", [[{ clientId: "a", at: 0 }, { clientId: "b", at: 0 }, { clientId: "a", at: 0 }, { clientId: "b", at: 0 }], 1, 500], [true, true, false, false], true),
    t("refill is capped at capacity", [[{ clientId: "a", at: 0 }, { clientId: "a", at: 0 }, { clientId: "a", at: 1000 }, { clientId: "a", at: 1000 }, { clientId: "a", at: 1000 }], 2, 100], [true, true, true, true, false], true),
    t("partial intervals add nothing", [[{ clientId: "a", at: 0 }, { clientId: "a", at: 999 }, { clientId: "a", at: 1000 }], 1, 1000], [true, false, true], true),
    t("refill clock advances by whole intervals", [[{ clientId: "a", at: 0 }, { clientId: "a", at: 1500 }, { clientId: "a", at: 2000 }], 1, 1000], [true, true, true], true),
    t("rejects zero capacity", [[{ clientId: "a", at: 0 }], 0, 1000], null, true, true),
  ],
};

const replayLedger: ChallengeTemplate = {
  id: "replay-ledger",
  keywords: ["ledger", "event sourc", "event-sourc", "replay", "balance", "idempoten"],
  tier: "master",
  type: "debugging",
  title: "Fix the ledger event replay",
  statement: (context, language) => `${context}

\`${language === "python" ? "replay_ledger" : "replayLedger"}(events)\` rebuilds account balances from an event log, but balances in production don't match. Each event is \`{ id, accountId, seq, type, amount }\` where \`type\` is \`"deposit"\` or \`"withdraw"\`. Fix it so that:

- Events are applied in ascending \`seq\` order. Events with equal \`seq\` keep their original order.
- An event whose \`id\` was already applied is a duplicate delivery and is ignored.
- A withdrawal larger than the current balance is rejected: the balance is unchanged and its \`id\` is added to \`rejected\`. Withdrawing the exact balance is allowed.
- Every account that appears in an applied or rejected event is present in \`balances\` (starting at 0).
- Return \`{ balances, rejected }\`, with \`rejected\` in processing order.`,
  entry: { typescript: "replayLedger", python: "replay_ledger" },
  starter: {
    typescript: `type LedgerEvent = {
  id: string;
  accountId: string;
  seq: number;
  type: "deposit" | "withdraw";
  amount: number;
};

function replayLedger(events: LedgerEvent[]): { balances: Record<string, number>; rejected: string[] } {
  const balances: Record<string, number> = {};
  const rejected: string[] = [];
  for (const event of events) {
    const current = balances[event.accountId] ?? 0;
    if (event.type === "deposit") {
      balances[event.accountId] = current + event.amount;
    } else if (event.amount < current) {
      balances[event.accountId] = current - event.amount;
    } else {
      rejected.push(event.id);
    }
  }
  return { balances, rejected };
}
`,
    python: `def replay_ledger(events):
    balances = {}
    rejected = []
    for event in events:
        current = balances.get(event["accountId"], 0)
        if event["type"] == "deposit":
            balances[event["accountId"]] = current + event["amount"]
        elif event["amount"] < current:
            balances[event["accountId"]] = current - event["amount"]
        else:
            rejected.append(event["id"])
    return {"balances": balances, "rejected": rejected}
`,
  },
  reference: {
    typescript: `type LedgerEvent = {
  id: string;
  accountId: string;
  seq: number;
  type: "deposit" | "withdraw";
  amount: number;
};

function replayLedger(events: LedgerEvent[]): { balances: Record<string, number>; rejected: string[] } {
  const balances: Record<string, number> = {};
  const rejected: string[] = [];
  const applied = new Set<string>();
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.seq - b.event.seq || a.index - b.index);

  for (const { event } of ordered) {
    if (applied.has(event.id)) continue;
    applied.add(event.id);
    const current = balances[event.accountId] ?? 0;
    if (event.type === "deposit") {
      balances[event.accountId] = current + event.amount;
    } else if (event.amount <= current) {
      balances[event.accountId] = current - event.amount;
    } else {
      balances[event.accountId] = current;
      rejected.push(event.id);
    }
  }
  return { balances, rejected };
}
`,
    python: `def replay_ledger(events):
    balances = {}
    rejected = []
    applied = set()
    ordered = sorted(enumerate(events), key=lambda pair: (pair[1]["seq"], pair[0]))
    for _, event in ordered:
        if event["id"] in applied:
            continue
        applied.add(event["id"])
        current = balances.get(event["accountId"], 0)
        if event["type"] == "deposit":
            balances[event["accountId"]] = current + event["amount"]
        elif event["amount"] <= current:
            balances[event["accountId"]] = current - event["amount"]
        else:
            balances[event["accountId"]] = current
            rejected.append(event["id"])
    return {"balances": balances, "rejected": rejected}
`,
  },
  tests: [
    t("deposit then withdraw", [[{ id: "e1", accountId: "a", seq: 1, type: "deposit", amount: 100 }, { id: "e2", accountId: "a", seq: 2, type: "withdraw", amount: 30 }]], { balances: { a: 70 }, rejected: [] }, false),
    t("applies events in seq order", [[{ id: "e2", accountId: "a", seq: 2, type: "withdraw", amount: 50 }, { id: "e1", accountId: "a", seq: 1, type: "deposit", amount: 50 }]], { balances: { a: 0 }, rejected: [] }, false),
    t("ignores duplicate deliveries", [[{ id: "e1", accountId: "a", seq: 1, type: "deposit", amount: 40 }, { id: "e1", accountId: "a", seq: 1, type: "deposit", amount: 40 }, { id: "e2", accountId: "a", seq: 2, type: "withdraw", amount: 40 }]], { balances: { a: 0 }, rejected: [] }, true),
    t("rejects overdrafts", [[{ id: "e1", accountId: "a", seq: 1, type: "deposit", amount: 10 }, { id: "e2", accountId: "a", seq: 2, type: "withdraw", amount: 25 }]], { balances: { a: 10 }, rejected: ["e2"] }, true),
    t("allows withdrawing the exact balance", [[{ id: "e1", accountId: "b", seq: 1, type: "deposit", amount: 25 }, { id: "e2", accountId: "b", seq: 2, type: "withdraw", amount: 25 }]], { balances: { b: 0 }, rejected: [] }, true),
    t("interleaved accounts", [[{ id: "e3", accountId: "b", seq: 2, type: "withdraw", amount: 5 }, { id: "e1", accountId: "a", seq: 1, type: "deposit", amount: 20 }, { id: "e2", accountId: "b", seq: 1, type: "deposit", amount: 10 }, { id: "e4", accountId: "a", seq: 3, type: "withdraw", amount: 30 }]], { balances: { a: 20, b: 5 }, rejected: ["e4"] }, true),
    t("rejected first event still opens the account", [[{ id: "e1", accountId: "c", seq: 1, type: "withdraw", amount: 5 }]], { balances: { c: 0 }, rejected: ["e1"] }, true),
  ],
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  summarizeTotals,
  paginate,
  parseQuery,
  tokenBucket,
  replayLedger,
];

export function templatesFor(tier: Tier) {
  return CHALLENGE_TEMPLATES.filter((template) => template.tier === tier);
}
