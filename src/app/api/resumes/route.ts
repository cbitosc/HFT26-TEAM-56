import type { NextRequest } from "next/server";
import { apiError, json, requireUser } from "@/lib/api/http";
import { MAX_RESUME_BYTES } from "@/lib/resumes/constants";
import { RESUME_ERROR_MESSAGES as MESSAGES } from "@/lib/resumes/messages";
import { PdfError, assertPdfUpload, extractPdfText } from "@/lib/resumes/pdf";
import {
  StoreError,
  UPLOADS_PER_HOUR,
  countRecentUploads,
  deleteUnanalyzedResumes,
  insertResume,
} from "@/lib/resumes/store";
import { checkExtractedText, normalizeText } from "@/lib/resumes/text";
import { createClient } from "@/lib/supabase/server";

/** Multipart overhead allowed on top of the file itself. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

const PDF_ERROR_STATUS: Record<PdfError["code"], number> = {
  missing_file: 400,
  empty_file: 400,
  file_too_large: 413,
  not_pdf: 415,
  pdf_encrypted: 422,
  pdf_unreadable: 422,
  too_many_pages: 422,
};

function safeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "resume.pdf";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(-255);
  return cleaned || "resume.pdf";
}

/**
 * POST /api/resumes (multipart, field "file")
 * Validates the PDF, extracts its text, stores the file at
 * `<user_id>/<resume_id>.pdf` and creates the résumé row. Analysis is a
 * separate call: POST /api/resumes/:id/analyze.
 */
export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  const { userId } = guard;

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESUME_BYTES + FORM_OVERHEAD_BYTES) {
    return apiError(413, "file_too_large", MESSAGES.file_too_large);
  }

  let file: File;
  let bytes: Uint8Array;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (!(entry instanceof File)) throw new PdfError("missing_file");
    file = entry;
    bytes = new Uint8Array(await file.arrayBuffer());
    assertPdfUpload(file, bytes);
  } catch (error) {
    if (error instanceof PdfError) {
      return apiError(PDF_ERROR_STATUS[error.code], error.code, MESSAGES[error.code]);
    }
    return apiError(400, "missing_file", MESSAGES.missing_file);
  }

  let text: string;
  try {
    text = normalizeText((await extractPdfText(bytes)).text);
  } catch (error) {
    if (error instanceof PdfError) {
      return apiError(PDF_ERROR_STATUS[error.code], error.code, MESSAGES[error.code]);
    }
    return apiError(422, "pdf_unreadable", MESSAGES.pdf_unreadable);
  }

  const textCheck = checkExtractedText(text);
  if (!textCheck.ok) {
    return apiError(422, textCheck.code, MESSAGES[textCheck.code]);
  }

  try {
    if ((await countRecentUploads(userId)) >= UPLOADS_PER_HOUR) {
      return apiError(429, "rate_limited", MESSAGES.rate_limited);
    }
    await deleteUnanalyzedResumes(userId);
  } catch (error) {
    console.error("[resumes] pre-upload checks failed", error);
    return apiError(500, "server_error", MESSAGES.server_error, true);
  }

  const resumeId = crypto.randomUUID();
  const storagePath = `${userId}/${resumeId}.pdf`;

  // Upload as the user so the bucket's ownership policies apply too.
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[resumes] storage upload failed", uploadError);
    return apiError(500, "storage_failed", MESSAGES.storage_failed, true);
  }

  try {
    const resume = await insertResume({
      id: resumeId,
      userId,
      filename: safeFilename(file.name),
      storagePath,
      extractedText: text,
    });
    return json({ resume }, 201);
  } catch (error) {
    console.error("[resumes] insert failed", error instanceof StoreError ? error.message : error);
    await supabase.storage.from("resumes").remove([storagePath]);
    return apiError(500, "server_error", MESSAGES.server_error, true);
  }
}
