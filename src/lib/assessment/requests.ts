import { z } from "zod";
import { TIERS } from "@/lib/assessment/config";
import { MAX_ANSWER_CHARS, MAX_CODE_CHARS, MAX_PROMPT_CHARS } from "@/lib/assessment/stages";

// Request bodies for the assessment workspace API.

const answerText = z.string().max(MAX_ANSWER_CHARS, `Answers are limited to ${MAX_ANSWER_CHARS.toLocaleString("en")} characters.`);
const code = z.string().max(MAX_CODE_CHARS, `Code is limited to ${MAX_CODE_CHARS.toLocaleString("en")} characters.`);

export const saveAnswerBody = z
  .object({ answerText: answerText.optional(), code: code.optional() })
  .strict()
  .refine((body) => (body.answerText === undefined) !== (body.code === undefined), "Send either answerText or code.");

export const codeBody = z.object({ code }).strict();

export const assistantBody = z
  .object({
    message: z.string().trim().min(1, "Type a question first.").max(MAX_PROMPT_CHARS, `Keep questions under ${MAX_PROMPT_CHARS} characters.`),
    /** The candidate's current, possibly unsaved, work for context. */
    work: z.string().max(MAX_CODE_CHARS).optional(),
  })
  .strict();

export const stageSubmitBody = z
  .object({
    /** Pending edits to save before the stage locks. */
    answers: z
      .array(
        z
          .object({ questionId: z.uuid(), answerText: answerText.optional(), code: code.optional() })
          .strict()
          .refine((answer) => (answer.answerText === undefined) !== (answer.code === undefined), "Send either answerText or code."),
      )
      .max(4)
      .optional(),
  })
  .strict();

export const tierParam = z.enum(TIERS);
