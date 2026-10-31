import type { ReactNode } from "react";

// Vetted AI answers in Markdown. This renders the subset those answers use
// (paragraphs, headings, lists, quotes, fenced code, simple tables, bold,
// italic, inline code, strikethrough and links) as React elements. Nothing
// is injected as HTML, so model output can't add markup or scripts.

type ListItem = { text: string; depth: number; number: number | null };

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "list"; items: ListItem[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "hr" };

const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let afterBlank = false;

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "p", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const last = blocks[blocks.length - 1];

    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const code: string[] = [];
      // An unclosed fence (a reply still being typed) runs to the end.
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i]);
      blocks.push({ kind: "code", lang: fence[1], code: code.join("\n") });
      afterBlank = false;
      continue;
    }

    if (!line.trim()) {
      flush();
      afterBlank = true;
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_DIVIDER.test(lines[i + 1] ?? "")) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      i += 1;
      while (i + 1 < lines.length && TABLE_ROW.test(lines[i + 1])) rows.push(cells(lines[++i]));
      blocks.push({ kind: "table", head, rows });
      afterBlank = false;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flush();
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] });
    } else if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "hr" });
    } else if (ITEM.test(line)) {
      flush();
      const [, indent, , number, text] = line.match(ITEM)!;
      const item = { text, depth: Math.min(3, Math.floor(indent.replace(/\t/g, "  ").length / 2)), number: number ? Number(number) : null };
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else if (QUOTE.test(line)) {
      flush();
      const text = line.match(QUOTE)![1];
      if (last?.kind === "quote" && !afterBlank) last.text += `\n${text}`;
      else blocks.push({ kind: "quote", text });
    } else if (last?.kind === "list" && !paragraph.length && !afterBlank) {
      // A wrapped line belongs to the list item above it.
      last.items[last.items.length - 1].text += `\n${line.trim()}`;
    } else {
      paragraph.push(line);
    }
    afterBlank = false;
  }
  flush();
  return blocks;
}

const INLINE =
  /(`+)([^`]+?)\1|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\[([^\]\n]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?![\s*])([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?![\s_])([^_\n]+?)(?<!\s)_(?![\w_])/g;

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const [whole, , code, bold, boldAlt, strike, label, href, em, emAlt] = match;
    const key = `${index}-${whole.length}`;
    if (code !== undefined) {
      out.push(
        <code key={key} className="rounded bg-surface-2 px-1 py-px font-mono text-[12px] text-foreground">
          {code}
        </code>,
      );
    } else if (bold !== undefined || boldAlt !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-foreground">
          {renderInline(bold ?? boldAlt)}
        </strong>,
      );
    } else if (strike !== undefined) {
      out.push(<del key={key}>{renderInline(strike)}</del>);
    } else if (label !== undefined) {
      out.push(
        SAFE_LINK.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            {renderInline(label)}
          </a>
        ) : (
          label
        ),
      );
    } else {
      out.push(<em key={key}>{renderInline(em ?? emAlt)}</em>);
    }
    last = index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * While a reply is typed out, its last line can stop inside `**bold**`,
 * `code` or ~~strike~~. Closing the open marker styles the words as they
 * arrive instead of flashing the raw symbols.
 */
function closeOpenMarkers(text: string) {
  let result = text;
  // A single * opening an italic on the last line (not a bullet, not 2 * 3).
  const lastLine = result.slice(result.lastIndexOf("\n") + 1).replace(/^\s*\*\s/, "");
  const singles = (lastLine.match(/(?<!\*)\*(?!\*)/g) ?? []).length;
  if (singles % 2 && /(?<![\w*])\*(?![\s*])[^*]*$/.test(lastLine)) result += "*";
  if ((result.match(/\*\*/g) ?? []).length % 2) result += "**";
  if ((result.match(/~~/g) ?? []).length % 2) result += "~~";
  if ((result.match(/`/g) ?? []).length % 2) result += "`";
  return result;
}

const HEADING_SIZE = ["text-[15px]", "text-[14px]", "text-[13px]"];

function renderBlock(block: Block, key: number, streaming: boolean, caret: ReactNode) {
  const inline = (text: string) => renderInline(streaming ? closeOpenMarkers(text) : text);
  switch (block.kind) {
    case "p":
      return (
        <p key={key} className="whitespace-pre-wrap">
          {inline(block.text)}
          {caret}
        </p>
      );
    case "h":
      return (
        <p key={key} className={`mt-1 font-semibold text-foreground ${HEADING_SIZE[Math.min(block.level, 3) - 1]}`}>
          {inline(block.text)}
          {caret}
        </p>
      );
    case "list":
      return (
        <ul key={key} className="space-y-1">
          {block.items.map((item, index) => {
            const isLast = index === block.items.length - 1;
            return (
              <li key={index} className="flex gap-2" style={{ paddingLeft: `${item.depth * 1.1}rem` }}>
                {item.number !== null ? (
                  <span className="min-w-4 shrink-0 text-right text-muted-foreground tabular-nums">{item.number}.</span>
                ) : (
                  <span aria-hidden="true" className="mt-[9px] size-1 shrink-0 rounded-full bg-muted-foreground/70" />
                )}
                <span className="min-w-0 whitespace-pre-wrap">
                  {isLast ? inline(item.text) : renderInline(item.text)}
                  {isLast ? caret : null}
                </span>
              </li>
            );
          })}
        </ul>
      );
    case "quote":
      return (
        <blockquote key={key} className="border-l-2 border-border-strong pl-3 whitespace-pre-wrap text-muted-foreground">
          {inline(block.text)}
          {caret}
        </blockquote>
      );
    case "code":
      return (
        <pre
          key={key}
          className="scroll-thin overflow-x-auto rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-[12px] leading-5 text-foreground/90"
        >
          {block.code}
          {caret}
        </pre>
      );
    case "table":
      return (
        <div key={key} className="scroll-thin overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-1 text-left text-muted-foreground">
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} className="px-2.5 py-1.5 font-medium">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} className="px-2.5 py-1.5 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={key} className="border-border" />;
  }
}

/**
 * A Vetted AI reply. With `streaming`, the text is a reply still being typed:
 * open markers on its last block are closed and `caret` is drawn after the
 * last character.
 */
export function Markdown({ text, streaming = false, caret = null }: { text: string; streaming?: boolean; caret?: ReactNode }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        const isLast = index === blocks.length - 1;
        return renderBlock(block, index, streaming && isLast, isLast ? caret : null);
      })}
      {blocks.length === 0 ? caret : null}
    </div>
  );
}
