"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, FileText, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_RESUME_BYTES,
  MAX_RESUME_MB,
  PDF_MIME_TYPES,
  hasPdfExtension,
  type ApiErrorBody,
} from "@/lib/resumes/constants";
import type { PendingResume } from "@/lib/data/resumes";
import { cn } from "@/lib/utils";

type Phase = "idle" | "selected" | "uploading" | "analyzing" | "done" | "error";

type UploadError = {
  message: string;
  /** Set when the file is stored and only the analysis needs another try. */
  retryResumeId?: string;
};

type ResumeUploadProps = {
  className?: string;
  /** Title override, e.g. when replacing an existing résumé. */
  title?: string;
  /** An earlier upload that hasn't finished analysis (e.g. after a refresh). */
  pending?: PendingResume | null;
  /** `plain` drops the outer card, e.g. inside a dialog. */
  variant?: "card" | "plain";
};

/** What's shown in the file row: a picked File, or a stored upload's name. */
type FileInfo = { name: string; size?: number };

const POLL_MS = 3_000;
/** Stop waiting on an analysis we didn't start after the server's claim timeout. */
const RESUMED_ANALYSIS_LIMIT_MS = 3 * 60 * 1000;

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Cheap client-side checks; the server repeats all of them. */
async function checkFile(file: File): Promise<string | null> {
  if (!hasPdfExtension(file.name) || (file.type && !PDF_MIME_TYPES.includes(file.type))) {
    return "Only PDF files are supported.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_RESUME_BYTES) return `That file is larger than ${MAX_RESUME_MB} MB.`;
  const head = new TextDecoder("latin1").decode(await file.slice(0, 1024).arrayBuffer());
  if (!head.includes("%PDF-")) return "That file isn't a valid PDF.";
  return null;
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

/**
 * POSTs the form with XMLHttpRequest, which (unlike fetch) reports how many
 * bytes have been sent, so the progress shown is the real upload progress.
 */
function uploadWithProgress(form: FormData, onProgress: (fraction: number) => void) {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/resumes");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          headers: { "Content-Type": xhr.getResponseHeader("Content-Type") ?? "application/json" },
        }),
      );
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(form);
  });
}

/**
 * Picks (or receives by drag and drop) a PDF résumé, uploads it, and runs the
 * analysis. Refreshes the page when done so the dashboard shows the result.
 */
export function ResumeUpload({ className, title = "Submit your résumé", pending, variant = "card" }: ResumeUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const hintId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [stored, setStored] = useState<FileInfo | null>(pending ? { name: pending.filename } : null);
  const [phase, setPhase] = useState<Phase>(
    pending?.state === "analyzing" ? "analyzing" : pending ? "error" : "idle",
  );
  const [error, setError] = useState<UploadError | null>(
    pending?.state === "needs_retry"
      ? { message: "This upload wasn't analysed. Try again, or choose another file.", retryResumeId: pending.id }
      : null,
  );
  // Set while waiting on an analysis started before this page loaded.
  const [watching, setWatching] = useState<string | null>(pending?.state === "analyzing" ? pending.id : null);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const shown: FileInfo | null = file ? { name: file.name, size: file.size } : stored;

  // After a refresh mid-analysis, the request that started it is gone but the
  // server finishes it; follow the résumé's status until it settles.
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    const started = Date.now();
    const poll = setInterval(async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/resumes/current", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const { resume } = (await response.json()) as { resume: { id: string; status: string } | null };
        if (cancelled) return;
        if (resume?.status === "analyzed") {
          setWatching(null);
          setPhase("done");
          router.refresh();
        } else if (!resume || resume.id !== watching) {
          // Rejected résumés are discarded, so the row is gone.
          setWatching(null);
          setStored(null);
          setPhase("error");
          setError({ message: "That résumé couldn't be used. Please upload a different PDF." });
        } else if (resume.status === "failed" || Date.now() - started > RESUMED_ANALYSIS_LIMIT_MS) {
          setWatching(null);
          setPhase("error");
          setError({ message: "We couldn't analyse your résumé.", retryResumeId: watching });
        }
      } catch {
        // Transient network error: try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [watching, router]);

  const busy = phase === "uploading" || phase === "analyzing" || phase === "done";

  async function choose(picked: File | null) {
    if (!picked || busy) return;
    const problem = await checkFile(picked);
    if (problem) {
      setFile(null);
      setPhase("error");
      setError({ message: problem });
      return;
    }
    setFile(picked);
    setStored(null);
    setError(null);
    setPhase("selected");
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    // Reset so choosing the same file again still fires a change event.
    event.target.value = "";
    void choose(picked);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files?.[0] ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
    if (!busy) setDragging(true);
  }

  function clear() {
    setFile(null);
    setStored(null);
    setError(null);
    setPhase("idle");
  }

  async function analyze(resumeId: string) {
    setPhase("analyzing");
    setError(null);
    try {
      const response = await fetch(`/api/resumes/${resumeId}/analyze`, { method: "POST" });
      if (!response.ok) {
        const message = await readError(response, "We couldn't analyse your résumé.");
        setPhase("error");
        // 422: rejected and discarded, so pick another file. 404: it's gone.
        // Anything else is transient and the stored file can be retried.
        const final = response.status === 422 || response.status === 404;
        setError({ message, retryResumeId: final ? undefined : resumeId });
        if (final) {
          setFile(null);
          setStored(null);
        }
        return;
      }
      setPhase("done");
      router.refresh();
    } catch {
      setPhase("error");
      setError({ message: NETWORK_ERROR, retryResumeId: resumeId });
    }
  }

  async function upload() {
    if (!file) return;
    setPhase("uploading");
    setUploaded(null);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    let resumeId: string;
    try {
      const response = await uploadWithProgress(form, setUploaded);
      if (!response.ok) {
        setPhase("error");
        setError({ message: await readError(response, "We couldn't upload your résumé.") });
        if (response.status === 413 || response.status === 415 || response.status === 422) {
          setFile(null);
        }
        return;
      }
      const body = (await response.json()) as { resume: { id: string } };
      resumeId = body.resume.id;
    } catch {
      setPhase("error");
      setError({ message: NETWORK_ERROR });
      return;
    }

    await analyze(resumeId);
  }

  return (
    <section
      aria-labelledby={headingId}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "transition-colors duration-150",
        variant === "card" && "rounded-lg border bg-card p-6 sm:p-7",
        variant === "card" && (dragging ? "border-primary bg-primary/[0.03]" : "border-border"),
        className,
      )}
    >
      <h2 id={headingId} className={cn("tracking-[-0.02em]", variant === "card" ? "text-lg" : "text-base font-medium")}>
        {title}
      </h2>
      <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
        Vetted reads the projects, skills and experience on your résumé and
        builds an assessment around them, so you&apos;re tested on the work
        you&apos;ve actually done.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />

      {!shown && !busy ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "mt-5 flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center transition-colors duration-150",
            dragging ? "border-primary bg-primary/[0.04]" : "border-border-strong/70 hover:border-border-strong hover:bg-foreground/[0.02]",
          )}
        >
          <FileText className="size-5 text-faint" aria-hidden="true" />
          <span className="text-[13px] text-foreground">Drop your résumé here</span>
          <span className="text-xs text-faint">or choose a file below</span>
        </button>
      ) : null}

      {shown ? (
        <div className="mt-5 flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5">
          <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{shown.name}</p>
            <p className="type-annotation text-faint">
              {shown.size !== undefined ? formatSize(shown.size) : "Uploaded"}
            </p>
          </div>
          {!busy ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${shown.name}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={clear}
            >
              <X />
            </Button>
          ) : null}
        </div>
      ) : null}

      {busy ? (
        <Progress phase={phase} uploaded={uploaded} />
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          {phase === "selected" ? (
            <>
              <Button type="button" onClick={upload}>
                <Upload />
                Upload & analyse
              </Button>
              <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()}>
                Choose a different file
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                aria-describedby={hintId}
                onClick={() => inputRef.current?.click()}
              >
                <Upload />
                Upload Résumé
              </Button>
              <p id={hintId} className="text-[13px] text-faint">
                PDF only, up to {MAX_RESUME_MB} MB.
              </p>
            </>
          )}
        </div>
      )}

      <div aria-live="polite">
        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/[0.06] px-3.5 py-2.5 text-[13px] leading-5 text-destructive"
          >
            {error.message}
            {error.retryResumeId ? (
              <button
                type="button"
                onClick={() => analyze(error.retryResumeId!)}
                className="ml-2 cursor-pointer font-medium underline underline-offset-2"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const STEPS = [
  { key: "upload", label: "Uploading and reading your PDF" },
  { key: "analyze", label: "Checking and analysing your résumé" },
  { key: "done", label: "Building your profile" },
] as const;

function Progress({ phase, uploaded }: { phase: Phase; uploaded: number | null }) {
  const current = phase === "uploading" ? 0 : phase === "analyzing" ? 1 : 2;

  return (
    <ol className="mt-5 space-y-2.5 rounded-md border border-border bg-surface-1 px-4 py-3.5" aria-label="Progress">
      {STEPS.map((step, index) => {
        const state =
          index < current || phase === "done" ? "done" : index === current ? "active" : "pending";
        return (
          <li
            key={step.key}
            className={cn(
              "flex items-center gap-2.5 text-[13px]",
              state === "pending" ? "text-faint" : "text-foreground",
            )}
          >
            {state === "done" ? (
              <Check className="size-4 text-primary" aria-hidden="true" />
            ) : state === "active" ? (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <Circle className="size-4 text-border-strong" aria-hidden="true" />
            )}
            {step.label}
            {step.key === "upload" && state === "active" && uploaded !== null ? (
              <span className="type-annotation tabular-nums text-faint">
                {uploaded < 1 ? `${Math.round(uploaded * 100)}%` : "reading…"}
              </span>
            ) : null}
            <span className="sr-only">
              {state === "done" ? "(done)" : state === "active" ? "(in progress)" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
