import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_RESUME_BYTES } from "@/lib/resumes/constants";
import { PdfError, assertPdfUpload, extractPdfText } from "@/lib/resumes/pdf";
import { checkExtractedText, normalizeText } from "@/lib/resumes/text";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/pdf/${name}`, import.meta.url)));
const asFile = (bytes: Uint8Array, name = "resume.pdf", type = "application/pdf") =>
  new File([bytes.slice()], name, { type });

async function failureOf(run: () => unknown) {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof PdfError ? error.code : String(error);
  }
}

describe("upload checks (before parsing)", () => {
  const pdf = fixture("resume.pdf");

  it("accepts a real PDF", () => {
    expect(() => assertPdfUpload(asFile(pdf), pdf)).not.toThrow();
  });

  it("rejects an empty file", async () => {
    expect(await failureOf(() => assertPdfUpload(asFile(new Uint8Array()), new Uint8Array()))).toBe("empty_file");
  });

  it("rejects files over 5 MB", async () => {
    const big = new Uint8Array(MAX_RESUME_BYTES + 1);
    big.set(pdf.subarray(0, 16));
    expect(await failureOf(() => assertPdfUpload(asFile(big), big))).toBe("file_too_large");
  });

  it("rejects a non-PDF extension", async () => {
    expect(await failureOf(() => assertPdfUpload(asFile(pdf, "resume.docx"), pdf))).toBe("not_pdf");
  });

  it("rejects a non-PDF MIME type", async () => {
    expect(await failureOf(() => assertPdfUpload(asFile(pdf, "resume.pdf", "image/png"), pdf))).toBe("not_pdf");
  });

  it("rejects a renamed image (no %PDF- signature)", async () => {
    const png = fixture("fake.pdf");
    expect(await failureOf(() => assertPdfUpload(asFile(png), png))).toBe("not_pdf");
  });
});

describe("parsing", () => {
  it("extracts text from a technical résumé", async () => {
    const { text } = await extractPdfText(fixture("resume.pdf"));
    const normalized = normalizeText(text);
    expect(normalized.length).toBeGreaterThan(200);
    expect(checkExtractedText(normalized)).toEqual({ ok: true });
  });

  it("rejects corrupted PDFs", async () => {
    expect(await failureOf(() => extractPdfText(fixture("corrupt.pdf")))).toBe("pdf_unreadable");
  });

  it("rejects password-protected PDFs", async () => {
    expect(await failureOf(() => extractPdfText(fixture("encrypted.pdf")))).toBe("pdf_encrypted");
  });

  it("rejects documents over the page limit", async () => {
    expect(await failureOf(() => extractPdfText(fixture("many-pages.pdf")))).toBe("too_many_pages");
  });

  it("flags image-only (scanned) PDFs", async () => {
    const { text } = await extractPdfText(fixture("scanned.pdf"));
    expect(checkExtractedText(normalizeText(text))).toEqual({ ok: false, code: "image_only" });
  });

  it("flags readable but non-technical documents", async () => {
    const { text } = await extractPdfText(fixture("recipe.pdf"));
    expect(checkExtractedText(normalizeText(text)).ok).toBe(false);
  });
});
