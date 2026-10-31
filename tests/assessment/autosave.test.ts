import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver, backupKey, readBackup, type BackupStore } from "@/lib/assessment/autosave";
import type { AnswerContent, ApiResult } from "@/lib/assessment/client";

// Autosave as the workspace uses it, for written answers and Monaco code
// alike: debouncing, flushing before a stage submission, retries, locking,
// and the local backup that survives a refresh.

type SaveResult = ApiResult<{ status: "in_progress" | "answered" | "submitted"; savedAt: string; revision: number }>;

const ok = (): SaveResult => ({ ok: true, data: { status: "in_progress", savedAt: new Date().toISOString(), revision: 1 } });
const offline = (): SaveResult => ({ ok: false, status: 0, code: "network_error", message: "offline", retryable: true });
const closed = (): SaveResult => ({ ok: false, status: 409, code: "stage_closed", message: "closed", retryable: false });

function memoryStore(): BackupStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, read: (k) => data.get(k) ?? null, write: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

let store: ReturnType<typeof memoryStore>;
let saves: { questionId: string; content: AnswerContent }[];

function saver(responses: (() => SaveResult)[] = [], onLocked = vi.fn()) {
  return new Autosaver({
    assessmentId: "a1",
    delayMs: 500,
    storage: store,
    isLockedCode: (code) => code === "stage_closed",
    onLocked,
    save: async (questionId, content) => {
      saves.push({ questionId, content });
      return (responses.shift() ?? ok)();
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  store = memoryStore();
  saves = [];
});
afterEach(() => vi.useRealTimers());

describe("Autosaver", () => {
  it("debounces edits into one save of the latest content", async () => {
    const s = saver();
    s.update("q1", { answerText: "H" });
    s.update("q1", { answerText: "He" });
    s.update("q1", { answerText: "Hello" });
    expect(s.state("q1")).toBe("pending");
    await vi.advanceTimersByTimeAsync(500);
    expect(saves).toEqual([{ questionId: "q1", content: { answerText: "Hello" } }]);
    expect(s.state("q1")).toBe("saved");
  });

  it("saves code the same way, separately per question", async () => {
    const s = saver();
    s.update("q1", { code: "function a() {}" });
    s.update("q2", { answerText: "text" });
    await vi.advanceTimersByTimeAsync(500);
    expect(saves).toHaveLength(2);
    expect(saves.find((save) => save.questionId === "q1")?.content).toEqual({ code: "function a() {}" });
  });

  it("flush() saves pending edits immediately, before a stage is submitted", async () => {
    const s = saver();
    s.update("q1", { answerText: "final" });
    expect(await s.flush()).toBe(true);
    expect(saves).toHaveLength(1);
    expect(s.unsaved()).toEqual([]);
  });

  it("keeps a local copy until the server confirms it, and retries after a failure", async () => {
    const s = saver([offline, offline]);
    s.update("q1", { answerText: "precious" });
    expect(readBackup(store, "a1", "q1")).toEqual({ answerText: "precious" });

    expect(await s.flush()).toBe(false);
    expect(s.state("q1")).toBe("error");
    expect(s.unsaved()).toEqual([{ questionId: "q1", answerText: "precious" }]);
    expect(readBackup(store, "a1", "q1")).toEqual({ answerText: "precious" });

    // Backoff: 2 s, then 4 s.
    await vi.advanceTimersByTimeAsync(6_000);
    expect(s.state("q1")).toBe("saved");
    expect(saves.length).toBe(3);
    expect(store.data.has(backupKey("a1", "q1"))).toBe(false);
  });

  it("an edit made while a save is in flight is saved afterwards", async () => {
    let release: () => void = () => {};
    const s = new Autosaver({
      assessmentId: "a1",
      delayMs: 100,
      storage: store,
      save: (questionId, content) => {
        saves.push({ questionId, content });
        return saves.length === 1 ? new Promise((resolve) => (release = () => resolve(ok()))) : Promise.resolve(ok());
      },
    });
    s.update("q1", { answerText: "one" });
    await vi.advanceTimersByTimeAsync(100);
    s.update("q1", { answerText: "one two" });
    release();
    await vi.advanceTimersByTimeAsync(200);
    expect(saves.map((save) => save.content)).toEqual([{ answerText: "one" }, { answerText: "one two" }]);
    expect(s.unsaved()).toEqual([]);
  });

  it("stops retrying once the server says the stage closed", async () => {
    const onLocked = vi.fn();
    const s = saver([closed], onLocked);
    s.update("q1", { answerText: "late" });
    await vi.advanceTimersByTimeAsync(500);
    expect(s.state("q1")).toBe("locked");
    expect(onLocked).toHaveBeenCalledWith("q1", "stage_closed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(saves).toHaveLength(1);
    // Edits after locking are ignored.
    s.update("q1", { answerText: "later" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(saves).toHaveLength(1);
  });

  it("lock() cancels pending saves for a submitted stage and clears their backups", async () => {
    const s = saver();
    s.update("q1", { answerText: "x" });
    s.lock(["q1"]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(saves).toHaveLength(0);
    expect(store.data.size).toBe(0);
  });

  it("ignores corrupt backups", () => {
    store.write(backupKey("a1", "q1"), "{not json");
    expect(readBackup(store, "a1", "q1")).toBeNull();
    store.write(backupKey("a1", "q2"), JSON.stringify({ content: { code: 42 } }));
    expect(readBackup(store, "a1", "q2")).toBeNull();
  });
});
