import { MAX_RESUME_MB, MAX_RESUME_PAGES } from "@/lib/resumes/constants";

/** Candidate-facing explanations for every résumé rejection or failure. */
export const RESUME_ERROR_MESSAGES = {
  missing_file: "Choose a PDF to upload.",
  empty_file: "That file is empty. Please choose your résumé PDF.",
  file_too_large: `That file is larger than ${MAX_RESUME_MB} MB. Please upload a smaller PDF.`,
  not_pdf: "Only PDF files are supported. Please export your résumé as a PDF.",
  pdf_encrypted:
    "This PDF is password-protected. Remove the password, export it again and re-upload.",
  pdf_unreadable:
    "We couldn't open this PDF. It may be damaged. Try exporting it again.",
  too_many_pages: `Your résumé is longer than ${MAX_RESUME_PAGES} pages. Please upload a shorter version.`,
  image_only:
    "We couldn't find any text in this PDF. It looks like a scanned or image-only file. Please upload a PDF exported from a document editor.",
  insufficient_text:
    "There isn't enough text in this PDF to build an assessment. Please upload your full résumé.",
  not_technical:
    "We couldn't find technical skills or experience in this document. Vetted builds assessments from technical résumés.",
  not_resume: "This doesn't look like a résumé. Please upload your résumé or CV.",
  insufficient_information:
    "Your résumé needs more technical detail, like the technologies you've used and the projects or roles you used them in.",
  rate_limited: "You've uploaded several résumés recently. Please wait an hour and try again.",
  ai_unavailable: "We couldn't analyse your résumé right now. Please try again in a moment.",
  ai_not_configured: "Résumé analysis isn't available yet. Please try again later.",
  analysis_in_progress: "This résumé is already being analysed.",
  not_found: "We couldn't find that résumé.",
  storage_failed: "We couldn't save your file. Please try again.",
  server_error: "Something went wrong on our side. Please try again.",
} as const;

export type ResumeErrorCode = keyof typeof RESUME_ERROR_MESSAGES;
