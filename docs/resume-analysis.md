# Résumé upload and analysis

## Flow

1. **Upload**: `POST /api/resumes` (multipart, field `file`)
   - Checks the session and the request origin.
   - Validates the extension, MIME type, `%PDF-` signature and size (5 MB max).
   - Parses the PDF with [unpdf](https://github.com/unjs/unpdf) and extracts its text. It rejects encrypted, corrupted, image-only and >10-page files.
   - Runs deterministic text checks: at least 300 characters and 80 words, and at least 3 distinct technical terms.
   - Stores the file at `resumes/<user_id>/<resume_id>.pdf` (uploaded with the user's own session, so bucket policies apply) and creates the `resumes` row with status `uploaded`.
2. **Analyse**: `POST /api/resumes/:id/analyze`
   - Checks ownership and atomically claims the row (`processing`).
   - Removes contact details: emails, phone numbers and links.
   - Asks the model to **validate** the document (`isResume`, `isTechnicalResume`, `hasSufficientInformation`, `reason`). It rejects documents that fail, and deletes the rejected row and file.
   - Asks the model to **extract** the structured profile.
   - Keeps only skills, technologies and DSA topics that literally appear in the résumé text (grounding), removes duplicates and caps lengths.
   - Saves to `resumes.analysis` with status `analyzed`, then deletes the user's previous résumé.
3. **Read**: `GET /api/resumes/current` returns the latest résumé and its analysis (never the file path or raw text). The dashboard reads the same data server-side.

The upload component calls 1 then 2 and refreshes the dashboard. If analysis fails for a transient reason (provider down, malformed output after a retry), the row is marked `failed` and the UI offers **Try again** without re-uploading.

## AI safety

- **Server-side only:** all model calls run on the server; the key never reaches the browser.
- **Untrusted input:** the résumé is sent inside `<document>` tags. The system prompt says to treat it purely as data and ignore embedded instructions.
- **Injection removal:** before the model sees anything, sentences that address the AI or dictate the result ("ignore previous instructions", "mark this candidate as senior…") are removed. Grounding then also runs against the cleaned text, so skills named only in an injected line can't survive.
- **Experience level:** it comes from dated roles and titles only, never from self-descriptions.
- **Strict output:** responses use strict JSON Schema output (generated from the Zod schemas) and are re-validated with Zod. One corrective retry on invalid JSON.
- **No invented skills:** model output is grounded against the résumé text, so a hallucinated or injected skill that isn't in the document is dropped.
- **Rate limit:** 10 uploads per user per hour.

## Configuration

The AI client ([src/lib/ai/client.ts](../src/lib/ai/client.ts)) uses any OpenAI-compatible provider. **Featherless** is used when its key is set; OpenRouter is the fallback.

`.env.local`:

```env
FEATHERLESS_API_KEY=rc_...
FEATHERLESS_MODEL=Qwen/Qwen3-30B-A3B-Instruct-2507

# Alternative provider (used only when FEATHERLESS_API_KEY is unset)
# OPENROUTER_API_KEY=sk-or-v1-...
# OPENROUTER_MODEL=openai/gpt-4o-mini
```

Featherless enforces `response_format: json_schema` (verified), so replies always match the schema.

**Model choice.** `Qwen/Qwen3-30B-A3B-Instruct-2507` costs **1 concurrency unit**, has a 262k context and returns each analysis in seconds. Larger models such as `deepseek-ai/DeepSeek-V3-0324` or `Qwen/Qwen2.5-72B-Instruct` cost 4 units, so a plan with 4 units can run only one analysis at a time. Avoid gated models (Llama, Gemma) unless your Hugging Face account is linked. When the plan's concurrency is exhausted, Featherless returns 429 and the client retries with backoff.

Restart `npm run dev` after changing `.env.local`.

Apply [20261031020000_resume_upload_limit.sql](../supabase/migrations/20261031020000_resume_upload_limit.sql) to lower the bucket limit to 5 MB.

## Stored analysis shape

`resumes.analysis` (validated by `resumeAnalysisSchema` in [src/lib/resumes/schemas.ts](../src/lib/resumes/schemas.ts)):

```jsonc
{
  "version": 1,
  "model": "Qwen/Qwen3-30B-A3B-Instruct-2507",
  "analyzedAt": "2026-10-31T10:00:00.000Z",
  "validation": { "isResume": true, "isTechnicalResume": true, "hasSufficientInformation": true, "reason": "…" },
  "profile": {
    "candidateName": "…", "primaryDomain": "…", "experienceLevel": "junior", "experienceEvidence": "…",
    "programmingLanguages": [], "frameworksAndLibraries": [], "databases": [], "developerTools": [],
    "projects": [{ "name": "…", "description": "…", "technologies": [], "responsibilities": [] }],
    "responsibilities": [],
    "experience": [{ "role": "…", "organization": "…", "period": "…", "highlights": [], "technologies": [] }],
    "dsaTopics": [], "otherCompetencies": []
  }
}
```
