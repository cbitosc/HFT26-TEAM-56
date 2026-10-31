import { LANGUAGE_LABEL, type CodeLanguage } from "@/lib/assessment/config";
import type { ResumeProfile } from "@/lib/resumes/schemas";
import { compactForMatch } from "@/lib/resumes/text";

// Deterministic résumé grounding. Every question must point at claims that
// exist in the analysed profile; technologies and DSA topics that the
// candidate never claimed are rejected outright.

export type Claims = {
  /** Every claim value, compacted (lowercase alphanumerics, + and #), joined by "|". */
  corpus: string;
  /** Compacted single words and whole values, plus singular forms. */
  tokens: Set<string>;
  /** Word stems (first 4+ letters) appearing anywhere in the profile. */
  stems: Set<string>;
};

/** Claims implied by others: TypeScript users know JavaScript, and so on. */
const IMPLIED: Array<[string[], string[]]> = [
  [["typescript"], ["javascript"]],
  [["nextjs", "react", "node", "nodejs", "express", "expressjs", "vue", "vuejs", "angular", "svelte"], ["javascript"]],
  [["nextjs"], ["react"]],
  [["postgresql", "postgres", "mysql", "sqlite", "mariadb", "mssql"], ["sql"]],
];

const GENERIC_WORDS = new Set([
  "and", "the", "for", "with", "using", "use", "basics", "basic", "fundamentals",
  "concepts", "concept", "design", "handling", "management", "implementation",
  "implementing", "understanding", "knowledge", "development", "programming",
  "skills", "practices", "practice", "patterns", "pattern", "principles", "logic",
  "application", "applications", "code", "coding", "debugging", "testing", "data",
  "problem", "solving", "optimization", "optimisation", "performance", "system",
  "systems", "advanced", "intermediate", "core", "web", "based", "software",
]);

function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) ?? [];
}

function stem(word: string) {
  return word.length <= 4 ? word : word.slice(0, Math.max(4, Math.ceil(word.length * 0.7)));
}

function collectStrings(value: unknown, out: string[]) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
}

function addToken(tokens: Set<string>, token: string) {
  if (!token) return;
  tokens.add(token);
  if (token.length > 3 && token.endsWith("s")) tokens.add(token.slice(0, -1));
}

export function buildClaims(profile: ResumeProfile): Claims {
  // Values only (no JSON keys), and not the name or the level label:
  // "Priya" or "mid" must not ground anything.
  const values: string[] = [];
  collectStrings({ ...profile, candidateName: null, experienceLevel: null }, values);

  const tokens = new Set<string>();
  const stems = new Set<string>();
  const phrases: string[] = [];
  for (const value of values) {
    const phrase = compactForMatch(value);
    phrases.push(phrase);
    addToken(tokens, phrase);
    for (const word of words(value)) {
      addToken(tokens, compactForMatch(word));
      if (word.length >= 3) stems.add(stem(word));
    }
  }
  for (const [triggers, implied] of IMPLIED) {
    if (triggers.some((trigger) => tokens.has(trigger))) {
      implied.forEach((word) => {
        addToken(tokens, word);
        stems.add(stem(word));
      });
    }
  }
  return { corpus: phrases.join("|"), tokens, stems };
}

/**
 * Whether a compacted claim is present: exact token for short strings
 * (so "ts" doesn't match "projects"), substring for distinctive ones.
 */
export function hasClaim(claims: Claims, compact: string) {
  if (!compact) return false;
  return claims.tokens.has(compact) || (compact.length >= 5 && claims.corpus.includes(compact));
}

function significantWords(text: string) {
  return words(text).filter((word) => word.length >= 2 && !GENERIC_WORDS.has(word));
}

/**
 * A skill is supported when it appears in the profile, or when at least half
 * of its significant words do (so "REST API design" matches "Designed REST APIs").
 */
export function isSupportedSkill(skill: string, claims: Claims) {
  const compact = compactForMatch(skill);
  if (!compact) return false;
  if (hasClaim(claims, compact)) return true;
  const significant = significantWords(skill);
  if (significant.length === 0) return false;
  const hits = significant.filter(
    (word) => claims.stems.has(stem(word)) || hasClaim(claims, compactForMatch(word)),
  ).length;
  return hits * 2 >= significant.length;
}

/** Evidence must cite something concrete from the profile (a project, role, or technology). */
export function isGroundedEvidence(evidence: string, claims: Claims) {
  const significant = significantWords(evidence).filter((word) => word.length >= 3);
  const hits = significant.filter((word) => claims.stems.has(stem(word))).length;
  return hits >= 2 || (hits >= 1 && significant.length <= 3);
}

export function claimsLanguage(language: CodeLanguage, claims: Claims) {
  return hasClaim(claims, compactForMatch(LANGUAGE_LABEL[language]));
}

// --- Technologies ----------------------------------------------------------

type Tech = { name: string; pattern: RegExp; aliases: string[] };

function tech(name: string, pattern: RegExp, aliases: string[] = []): Tech {
  return { name, pattern, aliases: [compactForMatch(name), ...aliases] };
}

// Proper nouns are matched case-sensitively where the word is also common
// English ("React", "Express", "Go", "Rust", "Spring").
const KNOWN_TECH: Tech[] = [
  tech("JavaScript", /\bjavascript\b/i, ["js"]),
  tech("TypeScript", /\btypescript\b/i, ["ts"]),
  tech("Python", /\bpython\b/i),
  tech("Java", /\bJava\b(?!Script)/),
  tech("Kotlin", /\bkotlin\b/i),
  tech("Swift", /\bSwift\b/),
  tech("Go", /\bGo(?:lang)?\b(?=[\s,.)])/, ["golang"]),
  tech("Rust", /\bRust\b/),
  tech("Ruby", /\bRuby\b/),
  tech("PHP", /\bPHP\b/),
  tech("C#", /(?:^|[^\w])C#/, ["csharp"]),
  tech("C++", /(?:^|[^\w])C\+\+/, ["cpp"]),
  tech("Scala", /\bScala\b/),
  tech("Elixir", /\bElixir\b/),
  tech("Dart", /\bDart\b/),
  tech("React", /\bReact\b(?! Native)/),
  tech("React Native", /\bReact Native\b/),
  tech("Next.js", /\bNext\.?js\b/i, ["nextjs"]),
  tech("Vue", /\bVue(?:\.js)?\b/, ["vuejs"]),
  tech("Angular", /\bAngular\b/),
  tech("Svelte", /\bSvelte(?:Kit)?\b/),
  tech("Node.js", /\bNode(?:\.js|JS)?\b/, ["nodejs", "node"]),
  tech("Express", /\bExpress(?:\.js)?\b/, ["expressjs"]),
  tech("NestJS", /\bNest(?:JS)?\b/, ["nestjs"]),
  tech("Django", /\bdjango\b/i),
  tech("Flask", /\bflask\b/i),
  tech("FastAPI", /\bfastapi\b/i),
  tech("Spring", /\bSpring(?: Boot)?\b/, ["springboot"]),
  tech("Rails", /\bRails\b/, ["rubyonrails"]),
  tech("Laravel", /\blaravel\b/i),
  tech(".NET", /(?:^|\s)\.NET\b|\bASP\.NET\b/, ["net", "aspnet", "dotnet"]),
  tech("Flutter", /\bflutter\b/i),
  tech("GraphQL", /\bgraphql\b/i),
  tech("gRPC", /\bgrpc\b/i),
  tech("PostgreSQL", /\bpostgres(?:ql)?\b/i, ["postgres"]),
  tech("MySQL", /\bmysql\b/i),
  tech("SQLite", /\bsqlite\b/i),
  tech("MongoDB", /\bmongo(?:db)?\b/i, ["mongo"]),
  tech("Redis", /\bredis\b/i),
  tech("DynamoDB", /\bdynamodb\b/i),
  tech("Cassandra", /\bcassandra\b/i),
  tech("Elasticsearch", /\belastic ?search\b/i),
  tech("Firebase", /\bfirebase\b/i),
  tech("Supabase", /\bsupabase\b/i),
  tech("Prisma", /\bprisma\b/i),
  tech("Kafka", /\bkafka\b/i),
  tech("RabbitMQ", /\brabbitmq\b/i),
  tech("Celery", /\bcelery\b/i),
  tech("Docker", /\bdocker\b/i),
  tech("Kubernetes", /\bkubernetes\b|\bk8s\b/i, ["k8s"]),
  tech("Terraform", /\bterraform\b/i),
  tech("AWS", /\bAWS\b|\bAmazon Web Services\b/, ["amazonwebservices"]),
  tech("GCP", /\bGCP\b|\bGoogle Cloud\b/, ["googlecloud"]),
  tech("Azure", /\bAzure\b/),
  tech("TensorFlow", /\btensorflow\b/i),
  tech("PyTorch", /\bpytorch\b/i),
  tech("Pandas", /\bpandas\b/i),
  tech("NumPy", /\bnumpy\b/i),
  tech("Spark", /\bSpark\b/, ["apachespark", "pyspark"]),
  tech("Redux", /\bredux\b/i),
  tech("Tailwind", /\btailwind\b/i, ["tailwindcss"]),
  tech("Jest", /\bJest\b/),
  tech("pytest", /\bpytest\b/i),
  tech("Webpack", /\bwebpack\b/i),
];

/** Technologies named in the text that the candidate never claimed. */
export function unsupportedTechnologies(text: string, claims: Claims) {
  return KNOWN_TECH.filter(
    (entry) => entry.pattern.test(text) && !entry.aliases.some((alias) => hasClaim(claims, alias)),
  ).map((entry) => entry.name);
}

// --- Data structures and algorithms -----------------------------------------

type DsaFamily = { name: string; pattern: RegExp; claims: string[] };

const DSA_FAMILIES: DsaFamily[] = [
  { name: "dynamic programming", pattern: /\bdynamic programming\b|\bmemoi[sz]/i, claims: ["dynamicprogramming", "memoization", "memoisation"] },
  { name: "binary search", pattern: /\bbinary search\b(?! tree)/i, claims: ["binarysearch"] },
  { name: "graphs", pattern: /\bgraph (?:traversal|algorithm|search)|\bbreadth[- ]first\b|\bdepth[- ]first\b|\b(?:BFS|DFS)\b|\bdijkstra|\btopological sort|\bshortest path|\bminimum spanning tree|\bunion[- ]find\b|\bdisjoint set/i, claims: ["graph", "bfs", "dfs", "dijkstra", "shortestpath", "topologicalsort"] },
  { name: "trees", pattern: /\bbinary (?:search )?tree\b|\b(?:AVL|red[- ]black) tree\b|\bsegment tree\b|\bfenwick\b|\btree traversal\b|\bin-?order traversal\b/i, claims: ["tree", "bst"] },
  { name: "tries", pattern: /\btries\b|\btrie\b|\bprefix tree\b/i, claims: ["trie", "prefixtree"] },
  { name: "heaps", pattern: /\bheap\b(?!\s*(?:memory|size|snapshot|dump|allocation))|\bpriority queue\b/i, claims: ["heap", "priorityqueue"] },
  { name: "linked lists", pattern: /\blinked list\b/i, claims: ["linkedlist"] },
  { name: "backtracking", pattern: /\bbacktracking\b/i, claims: ["backtracking"] },
  { name: "greedy algorithms", pattern: /\bgreedy (?:algorithm|approach|strategy)\b/i, claims: ["greedy"] },
  { name: "sliding window / two pointers", pattern: /\bsliding window\b|\btwo[- ]pointers?\b/i, claims: ["slidingwindow", "twopointer"] },
  { name: "bit manipulation", pattern: /\bbit manipulation\b|\bbitmask/i, claims: ["bitmanipulation", "bitmask"] },
  { name: "sorting algorithms", pattern: /\b(?:merge|quick|heap|radix|bubble|insertion) ?sort\b/i, claims: ["sort"] },
];

/** DSA topics a question relies on that the résumé never mentions. */
export function unsupportedDsaTopics(text: string, claims: Claims) {
  return DSA_FAMILIES.filter(
    (family) => family.pattern.test(text) && !family.claims.some((claim) => hasClaim(claims, claim)),
  ).map((family) => family.name);
}
