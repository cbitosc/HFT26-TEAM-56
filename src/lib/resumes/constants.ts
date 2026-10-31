// Shared by the upload component (client) and the API routes (server).

export const MAX_RESUME_MB = 5;
export const MAX_RESUME_BYTES = MAX_RESUME_MB * 1024 * 1024;
export const MAX_RESUME_PAGES = 10;

export const PDF_MIME_TYPES = ["application/pdf", "application/x-pdf"];

export function hasPdfExtension(filename: string) {
  return filename.toLowerCase().endsWith(".pdf");
}

/** Error body returned by every /api/resumes endpoint. */
export type ApiErrorBody = {
  error: { code: string; message: string; retryable?: boolean };
};
