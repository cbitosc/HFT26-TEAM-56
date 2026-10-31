import "server-only";

// Client for a Piston code execution service (https://github.com/engineer-man/piston).
// Piston runs each job in its own unprivileged, network-less container with
// time, memory and output limits, so candidate code never runs on the app
// server. Configure a self-hosted instance with PISTON_URL.

export type PistonLanguage = "javascript" | "python";

export type PistonRun = {
  stdout: string;
  stderr: string;
  /** Exit status as reported by Piston. */
  code: number | null;
  signal: string | null;
  /** Piston's status code when it stopped the program: TO (time), OL/EL (output), SG (signal), XX (internal). */
  status: string | null;
  wallMs: number | null;
};

export class PistonError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PistonError";
  }
}

const MAX_STDOUT_CHARS = 256 * 1024;

export function pistonConfig() {
  const url = process.env.PISTON_URL?.trim().replace(/\/+$/, "");
  if (!url) return null;
  return {
    url,
    apiKey: process.env.PISTON_API_KEY?.trim() || null,
    versions: {
      javascript: process.env.PISTON_JAVASCRIPT_VERSION?.trim() || "*",
      python: process.env.PISTON_PYTHON_VERSION?.trim() || "*",
    } satisfies Record<PistonLanguage, string>,
    // Piston's default per-job maximums are 3 s of run time; keep within them.
    runTimeoutMs: Number(process.env.PISTON_RUN_TIMEOUT_MS) || 3_000,
    memoryLimitBytes: (Number(process.env.PISTON_MEMORY_LIMIT_MB) || 256) * 1024 * 1024,
  };
}

const FILE_NAME: Record<PistonLanguage, string> = { javascript: "main.js", python: "main.py" };

type PistonStage = {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  signal?: string | null;
  status?: string | null;
  wall_time?: number;
};

export async function runOnPiston(language: PistonLanguage, source: string, fetchImpl: typeof fetch = fetch): Promise<PistonRun> {
  const config = pistonConfig();
  if (!config) throw new PistonError("PISTON_URL is not configured");

  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/api/v2/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: config.apiKey } : {}),
      },
      body: JSON.stringify({
        language,
        version: config.versions[language],
        files: [{ name: FILE_NAME[language], content: source }],
        stdin: "",
        args: [],
        compile_timeout: 10_000,
        run_timeout: config.runTimeoutMs,
        run_memory_limit: config.memoryLimitBytes,
      }),
      // Covers queueing on a busy instance as well as the run itself.
      signal: AbortSignal.timeout(config.runTimeoutMs + 15_000),
    });
  } catch (error) {
    throw new PistonError("Code execution service is unreachable", { cause: error });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new PistonError(`Code execution service returned ${response.status}: ${detail.slice(0, 300)}`);
  }

  const body = (await response.json().catch(() => null)) as { run?: PistonStage; compile?: PistonStage } | null;
  const run = body?.run;
  if (!run) throw new PistonError("Code execution service returned no run result");
  if (run.status === "XX") throw new PistonError("Code execution service had an internal error");

  return {
    stdout: String(run.stdout ?? "").slice(0, MAX_STDOUT_CHARS),
    stderr: String(run.stderr ?? "").slice(0, 8_000),
    code: typeof run.code === "number" ? run.code : null,
    signal: run.signal ?? null,
    status: run.status ?? null,
    wallMs: typeof run.wall_time === "number" ? run.wall_time : null,
  };
}
