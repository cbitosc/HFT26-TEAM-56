"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowUp, LoaderCircle, Lock, PanelRightClose } from "lucide-react";
import { Markdown } from "@/components/assessment/workspace/markdown";
import { BrandMark } from "@/components/brand/wordmark";
import { ResizeHandle } from "@/components/shell/resize-handle";
import { Button } from "@/components/ui/button";
import type { ChatTurn } from "@/lib/assessment/session";
import { MAX_PROMPT_CHARS } from "@/lib/assessment/stages";
import { ASSISTANT_SIZE } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const ASSISTANT_PANEL_ID = "assistant-panel";

/** The blinking insertion point at the end of a reply that is being typed. */
function Caret() {
  return <span aria-hidden="true" className="typing-caret" />;
}

/** A reply, rendered from its Markdown; `caret` marks one still being typed. */
function MessageText({ text, caret = false }: { text: string; caret?: boolean }) {
  return <Markdown text={text} streaming={caret} caret={caret ? <Caret /> : null} />;
}

/**
 * Types out a reply that has just arrived. The API returns the whole answer
 * at once; this reveals it word by word, at roughly 60 characters a second
 * for short replies and never taking longer than about 2.5 seconds. Screen
 * readers get the full text immediately, and with reduced motion it appears
 * at once.
 */
function TypedReply({ text, onTick, onDone }: { text: string; onTick: () => void; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const tick = useEffectEvent(onTick);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Characters per millisecond.
    const rate = Math.max(0.06, text.length / 2500);
    let start: number | null = null;
    let count = 0;
    let frame = requestAnimationFrame(function step(now) {
      start ??= now;
      let target = instant ? text.length : Math.min(text.length, Math.floor((now - start) * rate));
      // Reveal whole words, like streamed tokens, never half a word.
      while (target < text.length && !/\s/.test(text[target])) target++;
      if (target !== count) {
        count = target;
        setShown(target);
        tick();
      }
      if (count < text.length) frame = requestAnimationFrame(step);
      else done();
    });
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <>
      <div className="sr-only">
        <Markdown text={text} />
      </div>
      <div aria-hidden="true">
        <MessageText text={text.slice(0, shown)} caret />
      </div>
    </>
  );
}

/** Three dots that pulse in turn while the reply is on its way. */
function Thinking() {
  return (
    <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span aria-hidden="true" className="thinking-dots">
        <span />
        <span />
        <span />
      </span>
      Thinking
    </p>
  );
}

function UserMessage({ children, pending }: { children: ReactNode; pending?: boolean }) {
  return (
    <div className="flex justify-end">
      <p
        className={cn(
          "max-w-[88%] rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap text-foreground",
          pending && "opacity-70",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function AssistantLabel() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-faint">
      <BrandMark className="size-4 rounded-[4px]" />
      Vetted AI
    </p>
  );
}

type AssistantPanelProps = {
  /** AI may be used on this question. */
  enabled: boolean;
  stageLabel: string;
  questionId: string;
  /** Number across the whole assessment (1–12). */
  questionNumber: number;
  questionTitle: string;
  turns: ChatTurn[];
  pending: boolean;
  error: string | null;
  onAsk: (message: string) => Promise<boolean>;
  /** Docked beside the workspace (xl and up). */
  docked: boolean;
  /** Open as an overlay (below xl). */
  sheetOpen: boolean;
  onClose: () => void;
  composerRef?: RefObject<HTMLTextAreaElement | null>;
};

/**
 * Vetted AI, beside the workspace. It stays mounted while hidden, so the
 * conversation, scroll position and unsent drafts survive collapsing,
 * resizing and switching questions. Drafts are kept per question.
 */
export function AssistantPanel({
  enabled,
  stageLabel,
  questionId,
  questionNumber,
  questionTitle,
  turns,
  pending,
  error,
  onAsk,
  docked,
  sheetOpen,
  onClose,
  composerRef,
}: AssistantPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  // A reply that arrives while the candidate is watching is typed out; the
  // conversation history renders as it is.
  const [awaiting, setAwaiting] = useState<{ questionId: string; known: number } | null>(null);
  const [typingId, setTypingId] = useState<string | null>(null);
  if (awaiting && awaiting.questionId === questionId && turns.length > awaiting.known) {
    setTypingId(turns[awaiting.known].id);
    setAwaiting(null);
  }
  const [shownQuestion, setShownQuestion] = useState(questionId);
  if (shownQuestion !== questionId) {
    setShownQuestion(questionId);
    setTypingId(null);
  }

  // The overlay stays mounted until its exit animation has played.
  const [sheetPresent, setSheetPresent] = useState(sheetOpen);
  if (sheetOpen && !sheetPresent) setSheetPresent(true);
  useEffect(() => {
    if (sheetOpen || !sheetPresent) return;
    const id = setTimeout(() => setSheetPresent(false), 240);
    return () => clearTimeout(id);
  }, [sheetOpen, sheetPresent]);

  // The docked column animates its width only when toggled, never while
  // its edge is being dragged.
  const [prevDocked, setPrevDocked] = useState(docked);
  const [dockAnimating, setDockAnimating] = useState(false);
  if (docked !== prevDocked) {
    setPrevDocked(docked);
    setDockAnimating(true);
  }
  useEffect(() => {
    if (!dockAnimating) return;
    const id = setTimeout(() => setDockAnimating(false), 450);
    return () => clearTimeout(id);
  }, [dockAnimating, docked]);
  const scroller = useRef<HTMLDivElement>(null);
  const message = drafts[questionId] ?? "";

  // Keep the newest message in view.
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [turns.length, sending, questionId]);

  function setMessage(value: string) {
    setDrafts((prev) => ({ ...prev, [questionId]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || pending) return;
    const asked = questionId;
    setSending(text);
    setAwaiting({ questionId, known: turns.length });
    const ok = await onAsk(text);
    setSending(null);
    if (ok) setDrafts((prev) => ({ ...prev, [asked]: "" }));
    else setAwaiting(null);
  }

  /** While a reply types out, follow it down unless the candidate has scrolled up to read. */
  function followReply() {
    const element = scroller.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 96) {
      element.scrollTop = element.scrollHeight;
    }
  }

  return (
    <>
      {sheetPresent ? (
        <div
          aria-hidden="true"
          data-state={sheetOpen ? "open" : "closed"}
          className="motion-overlay fixed inset-0 z-40 bg-black/45 xl:hidden"
          onClick={onClose}
        />
      ) : null}
      {/* From xl this column holds the docked panel; its width eases open and
          closed. The negative margin cancels the layout gap while closed. */}
      <div
        data-dock={docked ? "open" : "closed"}
        data-animating={dockAnimating || undefined}
        className={cn(
          "motion-dock contents xl:-ml-2 xl:block xl:shrink-0 xl:overflow-hidden",
          docked ? "xl:w-[calc(var(--assistant-width)+0.5rem)] xl:pl-2" : "xl:w-0",
        )}
      >
        <aside
          id={ASSISTANT_PANEL_ID}
          aria-label="Vetted AI"
          data-state={sheetOpen ? "open" : "closed"}
          className={cn(
            "motion-sheet-right fixed inset-y-2 right-2 z-50 w-[calc(100%-1rem)] max-w-[400px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_64px_-12px_rgb(0_0_0/0.4)]",
            sheetPresent ? "flex" : "hidden",
            "xl:relative xl:inset-auto xl:z-auto xl:h-full xl:w-(--assistant-width) xl:max-w-none xl:overflow-visible xl:shadow-(--panel-shadow)",
            docked || dockAnimating ? "xl:flex" : "xl:hidden",
          )}
        >
          <ResizeHandle
            size={ASSISTANT_SIZE}
            edge="left"
            label="Resize Vetted AI"
            controls={ASSISTANT_PANEL_ID}
            className="hidden xl:block"
          />

          <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
            <BrandMark className="size-7" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-4 font-medium text-foreground">Vetted AI</p>
              <p className="truncate text-xs leading-4 text-muted-foreground">
                Helping with Question {questionNumber}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close Vetted AI"
              title="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <PanelRightClose />
            </Button>
          </header>

          <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <p className="truncate border-b border-border-subtle pb-3 text-xs text-faint" title={questionTitle}>
              {questionTitle}
            </p>

            {!enabled ? (
              <div className="mt-4 flex items-start gap-2.5 text-[13px] leading-5 text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <p>AI assistance isn&apos;t available for this question in the {stageLabel} stage.</p>
              </div>
            ) : turns.length || sending ? (
              <ol className="mt-4 space-y-5" aria-live="polite">
                {turns.map((turn) => (
                  <li key={turn.id} className="space-y-3">
                    <UserMessage>{turn.prompt}</UserMessage>
                    <div className="space-y-1.5 text-[13px] leading-6 text-foreground/90">
                      <AssistantLabel />
                      {turn.id === typingId ? (
                        <TypedReply text={turn.response} onTick={followReply} onDone={() => setTypingId(null)} />
                      ) : (
                        <MessageText text={turn.response} />
                      )}
                    </div>
                  </li>
                ))}
                {sending ? (
                  <li className="space-y-3">
                    <UserMessage pending>{sending}</UserMessage>
                    <div className="space-y-1.5">
                      <AssistantLabel />
                      <Thinking />
                    </div>
                  </li>
                ) : null}
              </ol>
            ) : (
              <div className="mt-6">
                <p className="text-sm text-foreground">Ask for a hint or clarification.</p>
                <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
                  Ask about the requirements, a concept, or an error message. Vetted AI guides you without revealing the
                  answer. Hints are logged with your assessment; you&apos;re never penalised for not using them.
                </p>
              </div>
            )}
          </div>

          {enabled ? (
            <form onSubmit={submit} className="shrink-0 border-t border-border p-3">
              <label htmlFor="assistant-message" className="sr-only">
                Your question for Vetted AI
              </label>
              <div className="rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
                <textarea
                  id="assistant-message"
                  ref={composerRef}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  readOnly={pending}
                  maxLength={MAX_PROMPT_CHARS}
                  rows={3}
                  placeholder="Ask about this question"
                  className="scroll-thin block max-h-40 min-h-16 w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-5 text-foreground outline-none placeholder:text-faint field-sizing-content"
                />
                <div className="flex items-center justify-between gap-2 px-2 pb-2">
                  <p className="pl-1 text-[11px] text-faint">
                    {message.length > MAX_PROMPT_CHARS * 0.8
                      ? `${message.length} / ${MAX_PROMPT_CHARS}`
                      : "Enter to send · Shift + Enter for a new line"}
                  </p>
                  <Button
                    type="submit"
                    size="icon-xs"
                    disabled={pending || !message.trim()}
                    aria-label="Send"
                    className="size-7 rounded-md"
                  >
                    {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
                  </Button>
                </div>
              </div>
              <p role="alert" className="mt-2 text-xs text-destructive empty:hidden">
                {error}
              </p>
            </form>
          ) : null}
        </aside>
      </div>
    </>
  );
}
