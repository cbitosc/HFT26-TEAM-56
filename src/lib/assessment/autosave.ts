import type { AnswerContent, ApiResult } from "@/lib/assessment/client";
import type { StoredAnswerStatus } from "@/lib/assessment/stages";

// Debounced, per-question autosave. Edits are coalesced; at most one save per
// question is in flight; failures are retried with backoff and every unsaved
// edit is mirrored to local storage, so nothing is lost to a refresh or a
// dropped connection. Answers the server reports as locked stop retrying.

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "locked";

type SaveResult = ApiResult<{ status: StoredAnswerStatus; savedAt: string; revision: number }>;

export type BackupStore = {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
};

type Entry = {
  content: AnswerContent;
  /** Bumped on every edit, to tell whether a finished save is still current. */
  version: number;
  savedVersion: number;
  state: SaveState;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  failures: number;
  error: string | null;
};

export type AutosaverOptions = {
  assessmentId: string;
  save: (questionId: string, content: AnswerContent) => Promise<SaveResult>;
  /** Called on every state change. */
  onChange?: (questionId: string, state: SaveState, detail: { error: string | null; status?: StoredAnswerStatus }) => void;
  /** Called when the server says the answer can't change any more (stage closed, submitted). */
  onLocked?: (questionId: string, code: string) => void;
  isLockedCode?: (code: string) => boolean;
  delayMs?: number;
  storage?: BackupStore | null;
};

const MAX_RETRY_MS = 30_000;

export function backupKey(assessmentId: string, questionId: string) {
  return `vetted:answer:${assessmentId}:${questionId}`;
}

export function browserBackupStore(): BackupStore | null {
  try {
    const storage = window.localStorage;
    return {
      read: (key) => storage.getItem(key),
      write: (key, value) => {
        try {
          storage.setItem(key, value);
        } catch {
          // Storage full or disabled: the server copy is still the source of truth.
        }
      },
      remove: (key) => storage.removeItem(key),
    };
  } catch {
    return null;
  }
}

/** A local copy of unsaved work, if one exists and differs from what the server has. */
export function readBackup(store: BackupStore | null, assessmentId: string, questionId: string): AnswerContent | null {
  const raw = store?.read(backupKey(assessmentId, questionId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { content?: AnswerContent };
    const content = parsed.content;
    if (content && ("answerText" in content ? typeof content.answerText === "string" : typeof content.code === "string")) {
      return content;
    }
  } catch {
    // Corrupt backup: ignore it.
  }
  return null;
}

export class Autosaver {
  private entries = new Map<string, Entry>();
  private readonly delayMs: number;
  private disposed = false;

  constructor(private readonly options: AutosaverOptions) {
    this.delayMs = options.delayMs ?? 800;
  }

  /** Records an edit and schedules a save. */
  update(questionId: string, content: AnswerContent) {
    if (this.disposed) return;
    const entry = this.entry(questionId, content);
    if (entry.state === "locked") return;
    entry.content = content;
    entry.version++;
    entry.failures = 0;
    this.options.storage?.write(
      backupKey(this.options.assessmentId, questionId),
      JSON.stringify({ content, at: Date.now() }),
    );
    this.setState(questionId, entry, "pending");
    this.schedule(questionId, entry, this.delayMs);
  }

  /** Saves everything pending now. Resolves true when every edit reached the server. */
  async flush(questionId?: string): Promise<boolean> {
    const ids = questionId ? [questionId] : [...this.entries.keys()];
    await Promise.all(ids.map((id) => this.saveNow(id)));
    return ids.every((id) => {
      const entry = this.entries.get(id);
      return !entry || entry.state === "locked" || entry.savedVersion === entry.version;
    });
  }

  /** Edits not yet confirmed by the server. */
  unsaved(): ({ questionId: string } & AnswerContent)[] {
    return [...this.entries.entries()]
      .filter(([, entry]) => entry.savedVersion !== entry.version && entry.state !== "locked")
      .map(([questionId, entry]) => ({ questionId, ...entry.content }));
  }

  /** Retries failed saves right away (e.g. when the browser comes back online). */
  retryFailed() {
    for (const [id, entry] of this.entries) {
      if (entry.state === "error") this.schedule(id, entry, 0);
    }
  }

  /** The server locked these answers: stop saving them and drop their local copies. */
  lock(questionIds: string[]) {
    for (const id of questionIds) {
      const entry = this.entries.get(id);
      if (entry?.timer) clearTimeout(entry.timer);
      if (entry) this.setState(id, entry, "locked");
      this.options.storage?.remove(backupKey(this.options.assessmentId, id));
    }
  }

  state(questionId: string): SaveState {
    return this.entries.get(questionId)?.state ?? "idle";
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) if (entry.timer) clearTimeout(entry.timer);
  }

  private entry(questionId: string, content: AnswerContent) {
    let entry = this.entries.get(questionId);
    if (!entry) {
      entry = { content, version: 0, savedVersion: 0, state: "idle", timer: null, inFlight: null, failures: 0, error: null };
      this.entries.set(questionId, entry);
    }
    return entry;
  }

  private schedule(questionId: string, entry: Entry, delay: number) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.saveNow(questionId);
    }, delay);
  }

  private async saveNow(questionId: string): Promise<void> {
    const entry = this.entries.get(questionId);
    if (!entry || entry.state === "locked") return;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    // One save at a time per question; a newer edit is saved right after.
    while (entry.inFlight) await entry.inFlight;
    // The state may have changed while waiting.
    if (entry.savedVersion === entry.version || (entry.state as SaveState) === "locked") return;

    const version = entry.version;
    const content = entry.content;
    this.setState(questionId, entry, "saving");
    entry.inFlight = (async () => {
      const result = await this.options.save(questionId, content);
      if (this.disposed) return;
      if (result.ok) {
        entry.savedVersion = Math.max(entry.savedVersion, version);
        entry.failures = 0;
        entry.error = null;
        if (entry.savedVersion === entry.version) {
          this.options.storage?.remove(backupKey(this.options.assessmentId, questionId));
          this.setState(questionId, entry, "saved", result.data.status);
        } else {
          this.setState(questionId, entry, "pending");
        }
        return;
      }
      const locked = (this.options.isLockedCode ?? (() => false))(result.code);
      entry.error = result.message;
      if (locked) {
        this.setState(questionId, entry, "locked");
        this.options.onLocked?.(questionId, result.code);
        return;
      }
      entry.failures++;
      this.setState(questionId, entry, "error");
      // Invalid requests (e.g. too long) won't succeed by retrying.
      if (result.retryable || result.status === 0 || result.status === 429) {
        this.schedule(questionId, entry, Math.min(MAX_RETRY_MS, 1_000 * 2 ** entry.failures));
      }
    })();
    try {
      await entry.inFlight;
    } finally {
      entry.inFlight = null;
    }
    if (entry.savedVersion !== entry.version && entry.state === "pending") await this.saveNow(questionId);
  }

  private setState(questionId: string, entry: Entry, state: SaveState, status?: StoredAnswerStatus) {
    entry.state = state;
    this.options.onChange?.(questionId, state, { error: entry.error, status });
  }
}
