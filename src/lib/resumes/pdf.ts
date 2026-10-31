import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import {
  MAX_RESUME_BYTES,
  MAX_RESUME_PAGES,
  PDF_MIME_TYPES,
  hasPdfExtension,
} from "@/lib/resumes/constants";

export type PdfCheckFailure =
  | "missing_file"
  | "empty_file"
  | "file_too_large"
  | "not_pdf"
  | "pdf_encrypted"
  | "pdf_unreadable"
  | "too_many_pages";

export class PdfError extends Error {
  constructor(readonly code: PdfCheckFailure) {
    super(code);
  }
}

/** `%PDF-` must appear within the first 1024 bytes (PDF 1.7 §7.5.2 tolerance). */
function hasPdfSignature(bytes: Uint8Array) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

/** Checks name, declared type, size and magic bytes. Doesn't parse the file. */
export function assertPdfUpload(file: File, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new PdfError("empty_file");
  if (bytes.byteLength > MAX_RESUME_BYTES) throw new PdfError("file_too_large");
  if (!hasPdfExtension(file.name)) throw new PdfError("not_pdf");
  if (!PDF_MIME_TYPES.includes(file.type)) throw new PdfError("not_pdf");
  if (!hasPdfSignature(bytes)) throw new PdfError("not_pdf");
}

/**
 * Parses the PDF and returns its text. Throws PdfError for encrypted,
 * corrupted or oversized documents. An image-only PDF parses fine but
 * yields little or no text; the caller decides what's enough.
 */
export async function extractPdfText(bytes: Uint8Array) {
  // PDF.js may transfer (detach) the buffer it's given, so parse a copy.
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(bytes.slice(), { stopAtErrors: true });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") throw new PdfError("pdf_encrypted");
    throw new PdfError("pdf_unreadable");
  }

  try {
    if (pdf.numPages > MAX_RESUME_PAGES) throw new PdfError("too_many_pages");
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text, pages: totalPages };
  } catch (error) {
    if (error instanceof PdfError) throw error;
    throw new PdfError("pdf_unreadable");
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}
