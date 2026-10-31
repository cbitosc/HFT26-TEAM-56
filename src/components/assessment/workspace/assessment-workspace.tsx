"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, LoaderCircle, Lock, X } from "lucide-react";
import { BrandMark } from "@/components/brand/wordmark";
import { ASSISTANT_PANEL_ID, AssistantPanel } from "@/components/assessment/workspace/assistant-panel";
import { CodeAnswer } from "@/components/assessment/workspace/code-answer";
import { CompletionScreen } from "@/components/assessment/workspace/completion-screen";
import { QuestionDetails } from "@/components/assessment/workspace/question-details";
import { QuestionNav } from "@/components/assessment/workspace/question-nav";
import { SplitPane } from "@/components/assessment/workspace/split-pane";
import { AssessmentTopBar } from "@/components/assessment/workspace/top-bar";
import { WorkspaceRail } from "@/components/assessment/workspace/workspace-rail";
import { WrittenAnswer } from "@/components/assessment/workspace/written-answer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Autosaver, browserBackupStore, readBackup, type SaveState } from "@/lib/assessment/autosave";
import { LOCKED_CODES, workspaceApi, type AnswerContent } from "@/lib/assessment/client";
import { TIER_CONFIG } from "@/lib/assessment/config";
import type { AssessmentSession, ExecutionView, SessionQuestion } from "@/lib/assessment/session";
import { nextTier, practicalAnswerStatus, writtenAnswerStatus, type AnswerStatus } from "@/lib/assessment/stages";
import { cn } from "@/lib/utils";

type SaveInfo = { state: SaveState; error: string | null };

function starterCode(question: SessionQuestion) {
  return question.starterFiles[0]?.content ?? "";
}

function savedDraft(question: SessionQuestion, session: AssessmentSession) {
  const answer = session.answers[question.id];
  return question.kind === "practical" ? (answer?.code ?? starterCode(question)) : (answer?.answerText ?? "");
}

function draftsFor(session: AssessmentSession) {
  return Object.fromEntries(session.questions.map((question) => [question.id, savedDraft(question, session)]));
}

function lockedFor(session: AssessmentSession) {
  return new Set(session.questions.filter((q) => session.answers[q.id]?.status === "submitted").map((q) => q.id));
}

function contentFor(question: SessionQuestion, value: string): AnswerContent {
  return question.kind === "practical" ? { code: value } : { answerText: value };
}

/** Ticks once a second on the server's clock, so changing the device clock gains no time. */
function useServerClock(serverTime: string) {
  const [now, setNow] = useState(() => Date.parse(serverTime));
  useEffect(() => {
    const offset = Date.parse(serverTime) - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), 1_000);
    return () => clearInterval(id);
  }, [serverTime]);
  return now;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Whether Vetted AI is docked open on wide screens, kept on this device.
const ASSISTANT_OPEN_KEY = "vetted:assistant-open";
const WIDE_QUERY = "(min-width: 80rem)";
const noopSubscribe = () => () => {};
function readAssistantDocked() {
  try {
    return window.localStorage.getItem(ASSISTANT_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * The live assessment: one stage at a time, one question at a time. The
 * server decides which stage is open and when it ends; this component
 * shows it, autosaves work and follows the server's transitions.
 */
export function AssessmentWorkspace({ initialSession }: { initialSession: AssessmentSession }) {
  const assessmentId = initialSession.assessmentId;
  const [session, setSession] = useState(initialSession);
  const sessionRef = useRef(initialSession);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => draftsFor(initialSession));
  const [locked, setLocked] = useState<Set<string>>(() => lockedFor(initialSession));
  const [saveInfo, setSaveInfo] = useState<Record<string, SaveInfo>>({});
  const [lastRuns, setLastRuns] = useState<Record<string, ExecutionView>>(initialSession.lastRuns);
  const [submissions, setSubmissions] = useState<Record<string, ExecutionView>>(initialSession.submissions);
  const [passingCode, setPassingCode] = useState<Record<string, string | null>>(initialSession.passingCode);
  const [chats, setChats] = useState(initialSession.chats);
  const [index, setIndex] = useState(0);
  const [mobileTab, setMobileTab] = useState<"question" | "answer">("question");
  const [busy, setBusy] = useState<{ questionId: string; kind: "run" | "submit" } | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>({});
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [confirmingStage, setConfirmingStage] = useState(false);
  const [submittingStage, setSubmittingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  // Vetted AI: docked beside the workspace from xl up, an overlay below.
  const savedDocked = useSyncExternalStore(noopSubscribe, readAssistantDocked, () => true);
  const [dockedOverride, setDockedOverride] = useState<boolean | null>(null);
  const assistantDocked = dockedOverride ?? savedDocked;
  const [assistantSheet, setAssistantSheet] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const saverRef = useRef<Autosaver | null>(null);
  const reloadRef = useRef<() => Promise<AssessmentSession | null>>(async () => null);
  const now = useServerClock(session.serverTime);

  /** Copies of unsaved edits left on this device (failed saves, closed tab) are restored and re-saved. */
  const restoreBackups = useCallback((current: AssessmentSession, saver: Autosaver) => {
    const store = browserBackupStore();
    const restored: Record<string, string> = {};
    for (const question of current.questions) {
      if (current.answers[question.id]?.status === "submitted") continue;
      const backup = readBackup(store, current.assessmentId, question.id);
      if (!backup) continue;
      const value = "code" in backup ? backup.code : backup.answerText;
      if (value === savedDraft(question, current)) {
        store?.remove(`vetted:answer:${current.assessmentId}:${question.id}`);
        continue;
      }
      restored[question.id] = value;
      saver.update(question.id, contentFor(question, value));
    }
    if (Object.keys(restored).length) {
      setDrafts((prev) => ({ ...prev, ...restored }));
      setNotice("Restored changes that hadn't reached the server yet. They're being saved now.");
    }
  }, []);

  const applySession = useCallback(
    (next: AssessmentSession) => {
      const previous = sessionRef.current;
      sessionRef.current = next;
      setSession(next);
      const moved = next.currentTier !== previous.currentTier || next.status !== previous.status;
      if (!moved) {
        // Same stage: keep local edits, pick up anything the server locked.
        setLocked((prev) => new Set([...prev, ...lockedFor(next)]));
        setSubmissions((prev) => ({ ...next.submissions, ...prev }));
        return;
      }

      saverRef.current?.lock(previous.questions.map((q) => q.id));
      setDrafts(draftsFor(next));
      setLocked(lockedFor(next));
      setLastRuns(next.lastRuns);
      setSubmissions(next.submissions);
      setPassingCode(next.passingCode);
      setChats(next.chats);
      setSaveInfo({});
      setActionErrors({});
      setAskError(null);
      setIndex(0);
      setMobileTab("question");
      setConfirmingStage(false);

      const closed = previous.currentTier ? next.stages.find((stage) => stage.tier === previous.currentTier) : null;
      const closedLabel = closed?.label ?? "This stage";
      if (next.currentTier) {
        const label = TIER_CONFIG[next.currentTier].label;
        setNotice(
          closed?.status === "expired"
            ? `Time's up for ${closedLabel}. Your answers were saved and locked. ${label} has started.`
            : `${closedLabel} submitted. ${label} has started: ${TIER_CONFIG[next.currentTier].minutes} minutes on the clock.`,
        );
      }
      if (saverRef.current) restoreBackups(next, saverRef.current);
      window.scrollTo({ top: 0 });
    },
    [restoreBackups],
  );

  const reload = useCallback(async () => {
    const result = await workspaceApi.session(assessmentId);
    if (!result.ok) {
      setConnectionError(result.message);
      return null;
    }
    setConnectionError(null);
    applySession(result.data.session);
    return result.data.session;
  }, [assessmentId, applySession]);

  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // One autosaver for the whole assessment.
  useEffect(() => {
    const saver = new Autosaver({
      assessmentId,
      save: (questionId, content) => workspaceApi.save(assessmentId, questionId, content),
      isLockedCode: (code) => LOCKED_CODES.has(code),
      onChange: (questionId, state, { error }) => setSaveInfo((prev) => ({ ...prev, [questionId]: { state, error } })),
      onLocked: () => void reloadRef.current(),
      storage: browserBackupStore(),
    });
    saverRef.current = saver;
    restoreBackups(sessionRef.current, saver);
    const online = () => {
      saver.retryFailed();
      void reloadRef.current();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saver.unsaved().length) event.preventDefault();
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
      saver.dispose();
      saverRef.current = null;
    };
  }, [assessmentId, restoreBackups]);

  // Remember the open question across refreshes (?q=2).
  useEffect(() => {
    const q = Number(new URLSearchParams(window.location.search).get("q"));
    if (Number.isInteger(q) && q >= 1 && q <= sessionRef.current.questions.length) setIndex(q - 1);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("q", String(index + 1));
    window.history.replaceState(window.history.state, "", url);
  }, [index]);

  // Escape closes the overlay.
  useEffect(() => {
    if (!assistantSheet) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssistantSheet(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assistantSheet]);

  const activeStage = session.stages.find((stage) => stage.status === "active") ?? null;
  const stageMs = activeStage?.expiresAt ? Math.max(0, Date.parse(activeStage.expiresAt) - now) : 0;
  const totalMs = session.expiresAt ? Math.max(0, Date.parse(session.expiresAt) - now) : 0;

  // At the deadline: save what's pending, then follow the server to the next stage.
  const flushedFor = useRef<string | null>(null);
  const expiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activeStage?.expiresAt) return;
    const key = `${activeStage.tier}:${activeStage.expiresAt}`;
    if (stageMs <= 5_000 && flushedFor.current !== key) {
      flushedFor.current = key;
      void saverRef.current?.flush();
    }
    if (stageMs === 0 && expiredFor.current !== key) {
      expiredFor.current = key;
      void (async () => {
        // The server applies the deadline by its own clock; retry briefly if it hasn't yet.
        for (let attempt = 0; attempt < 10; attempt++) {
          const next = await reloadRef.current();
          if (next && (next.currentTier !== activeStage.tier || next.status !== "in_progress")) return;
          await sleep(2_000);
        }
      })();
    }
  }, [activeStage, stageMs]);

  if (session.status !== "in_progress" || !session.currentTier || !activeStage) {
    return <CompletionScreen session={session} />;
  }

  const tier = session.currentTier;
  const questions = session.questions;
  const question = questions[Math.min(index, questions.length - 1)];
  const statusOf = (q: SessionQuestion): AnswerStatus =>
    q.kind === "practical"
      ? practicalAnswerStatus({ code: drafts[q.id] ?? "", starter: starterCode(q), passingCode: passingCode[q.id] ?? null, locked: locked.has(q.id) })
      : writtenAnswerStatus(drafts[q.id] ?? "", locked.has(q.id));
  const statuses = questions.map(statusOf);
  const answered = statuses.filter((status) => status === "answered" || status === "submitted").length;
  const isLast = index >= questions.length - 1;
  const following = nextTier(tier);

  function edit(q: SessionQuestion, value: string) {
    if (locked.has(q.id)) return;
    setDrafts((prev) => ({ ...prev, [q.id]: value }));
    saverRef.current?.update(q.id, contentFor(q, value));
  }

  async function runCode(q: SessionQuestion, kind: "run" | "submit") {
    const code = drafts[q.id] ?? "";
    setBusy({ questionId: q.id, kind });
    setActionErrors((prev) => ({ ...prev, [q.id]: null }));
    const result = kind === "run" ? await workspaceApi.run(assessmentId, q.id, code) : await workspaceApi.submitSolution(assessmentId, q.id, code);
    setBusy(null);
    if (!result.ok) {
      setActionErrors((prev) => ({ ...prev, [q.id]: result.message }));
      if (LOCKED_CODES.has(result.code)) void reload();
      return;
    }
    if ("run" in result.data) {
      const run = result.data.run;
      setLastRuns((prev) => ({ ...prev, [q.id]: run }));
      if (run.outcome === "passed") setPassingCode((prev) => ({ ...prev, [q.id]: code }));
    } else {
      const submission = result.data.submission;
      setSubmissions((prev) => ({ ...prev, [q.id]: submission }));
      setLocked((prev) => new Set([...prev, q.id]));
      saverRef.current?.lock([q.id]);
    }
  }

  async function ask(q: SessionQuestion, message: string) {
    setAsking(true);
    setAskError(null);
    const result = await workspaceApi.ask(assessmentId, q.id, message, drafts[q.id] ?? "");
    setAsking(false);
    if (!result.ok) {
      setAskError(result.message);
      if (LOCKED_CODES.has(result.code)) void reload();
      return false;
    }
    const turn = result.data.turn;
    setChats((prev) => ({ ...prev, [q.id]: [...(prev[q.id] ?? []), turn] }));
    return true;
  }

  async function submitStage() {
    setSubmittingStage(true);
    setStageError(null);
    await saverRef.current?.flush();
    // Anything still unsaved (e.g. a failing connection) travels with the submission.
    const pending = saverRef.current?.unsaved() ?? [];
    const result = await workspaceApi.submitStage(assessmentId, tier, pending);
    setSubmittingStage(false);
    if (!result.ok) {
      setStageError(result.message);
      if (LOCKED_CODES.has(result.code)) void reload();
      return;
    }
    if (result.data.session) applySession(result.data.session);
    else await reload();
  }

  function setDocked(open: boolean) {
    setDockedOverride(open);
    try {
      window.localStorage.setItem(ASSISTANT_OPEN_KEY, String(open));
    } catch {
      // Not persisted; fine.
    }
  }

  function toggleAssistant() {
    const wide = window.matchMedia(WIDE_QUERY).matches;
    const opening = wide ? !assistantDocked : !assistantSheet;
    if (wide) setDocked(opening);
    else setAssistantSheet(opening);
    if (opening) requestAnimationFrame(() => composerRef.current?.focus());
  }

  function closeAssistant() {
    if (window.matchMedia(WIDE_QUERY).matches) setDocked(false);
    else setAssistantSheet(false);
  }

  const save = saveInfo[question.id] ?? { state: "idle" as SaveState, error: null };
  const unsavedCount = Object.values(saveInfo).filter((info) => info.state === "error").length;
  const goTo = (next: number) => setIndex(Math.max(0, Math.min(questions.length - 1, next)));
  const primaryAction = isLast ? (
    <Button type="button" size="sm" onClick={() => setConfirmingStage(true)}>
      {following ? "Submit Stage & Continue" : "Submit & Finish Assessment"}
    </Button>
  ) : (
    <Button type="button" variant="outline" size="sm" onClick={() => goTo(index + 1)}>
      Next Question
      <ChevronRight aria-hidden="true" />
    </Button>
  );

  const stageAi = TIER_CONFIG[tier].aiAssistance;

  const questionPanel = (
    <div className="px-5 py-6 sm:px-7 sm:py-7">
      <QuestionDetails question={question} />
    </div>
  );

  const answerPanel =
    question.kind === "practical" ? (
      <CodeAnswer
        key={question.id}
        question={question}
        code={drafts[question.id] ?? ""}
        locked={locked.has(question.id)}
        saveState={save.state}
        saveError={save.error}
        lastRun={lastRuns[question.id] ?? null}
        submission={submissions[question.id] ?? null}
        busy={busy?.questionId === question.id ? busy.kind : null}
        blocked={busy !== null}
        actionError={actionErrors[question.id] ?? null}
        onChange={(value) => edit(question, value)}
        onRun={() => runCode(question, "run")}
        onSubmit={() => runCode(question, "submit")}
      />
    ) : (
      <WrittenAnswer
        key={question.id}
        questionId={question.id}
        value={drafts[question.id] ?? ""}
        locked={locked.has(question.id)}
        saveState={save.state}
        saveError={save.error}
        onChange={(value) => edit(question, value)}
        onSave={() => void saverRef.current?.flush(question.id)}
        action={primaryAction}
      />
    );

  return (
    <div className="flex h-dvh overflow-hidden bg-background lg:gap-2 lg:bg-canvas lg:p-2">
      <WorkspaceRail />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-xl lg:border lg:border-border lg:shadow-(--panel-shadow)">
        <AssessmentTopBar
          stages={session.stages}
          currentTier={tier}
          stageMs={stageMs}
          totalMs={totalMs}
          compact
          nav={<QuestionNav statuses={statuses} active={index} onSelect={goTo} firstNumber={questions[0]?.number ?? 1} />}
          tools={
            stageAi ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleAssistant}
                aria-controls={ASSISTANT_PANEL_ID}
                aria-label="Toggle Vetted AI"
                title="Vetted AI"
                className="text-muted-foreground hover:text-foreground"
              >
                <BrandMark className="size-4 rounded-[4px]" />
                <span className="hidden 2xl:inline">Vetted AI</span>
              </Button>
            ) : (
              <span
                className="flex size-8 items-center justify-center text-faint"
                title={`AI assistance is off in the ${TIER_CONFIG[tier].label} stage. It becomes available from Adept.`}
              >
                <Lock className="size-3.5" aria-hidden="true" />
                <span className="sr-only">AI assistance is off in the {TIER_CONFIG[tier].label} stage.</span>
              </span>
            )
          }
          actions={
            <Button type="button" size="sm" variant={isLast ? "default" : "outline"} onClick={() => setConfirmingStage(true)}>
              <span className="hidden sm:inline">{following ? "Submit stage" : "Submit & finish"}</span>
              <span className="sm:hidden">Submit</span>
            </Button>
          }
        />

        {notice || connectionError ? (
          <div className="flex shrink-0 items-start gap-3 border-b border-border bg-surface-1 px-4 py-2 text-[13px] sm:px-5" role="status">
            <p className={connectionError ? "text-destructive" : "text-foreground"}>{connectionError ?? notice}</p>
            {!connectionError ? (
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="ml-auto cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex shrink-0 border-b border-border lg:hidden" role="tablist" aria-label="Workspace">
          {(["question", "answer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mobileTab === value}
              onClick={() => setMobileTab(value)}
              className={cn(
                "-mb-px flex-1 cursor-pointer border-b-2 py-2 text-sm capitalize",
                mobileTab === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>

        <SplitPane
          left={questionPanel}
          right={answerPanel}
          mobilePanel={mobileTab === "question" ? "left" : "right"}
          leftLabel="Question"
          rightLabel="Answer"
        />
      </div>

      {stageAi ? (
        <AssistantPanel
          enabled={question.aiAssistance}
          stageLabel={TIER_CONFIG[tier].label}
          questionId={question.id}
          questionNumber={question.number}
          questionTitle={question.title}
          turns={chats[question.id] ?? []}
          pending={asking}
          error={askError}
          onAsk={(message) => ask(question, message)}
          docked={assistantDocked}
          sheetOpen={assistantSheet}
          onClose={closeAssistant}
          composerRef={composerRef}
        />
      ) : null}

      <Dialog open={confirmingStage} onOpenChange={(open) => !submittingStage && setConfirmingStage(open)}>
        <DialogContent>
          <DialogTitle>Submit {TIER_CONFIG[tier].label} Assessment?</DialogTitle>
          <DialogDescription>
            You&apos;ve answered {answered} of {questions.length} questions. Once submitted, you cannot return to this stage.
            {following
              ? ` ${TIER_CONFIG[following].label} starts immediately, with ${TIER_CONFIG[following].minutes} minutes.`
              : " This completes your assessment."}
          </DialogDescription>
          {unsavedCount ? (
            <p className="mt-3 text-[13px] text-destructive">
              Some changes haven&apos;t reached the server yet. They&apos;ll be sent with your submission.
            </p>
          ) : null}
          <p role="alert" className="mt-3 text-[13px] text-destructive empty:hidden">
            {stageError}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submittingStage}>
                Continue Editing
              </Button>
            </DialogClose>
            <Button type="button" onClick={submitStage} disabled={submittingStage}>
              {submittingStage ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {submittingStage ? "Submitting…" : following ? "Submit & Continue" : "Submit & Finish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
