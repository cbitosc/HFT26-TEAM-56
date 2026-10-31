import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/assessment/workspace/markdown";

const html = (text: string, streaming = false) => renderToStaticMarkup(createElement(Markdown, { text, streaming }));

describe("Vetted AI markdown", () => {
  it("renders the formatting the assistant uses instead of raw symbols", () => {
    const out = html(
      "Think about the visitor's state (e.g., *pending*, *approved*).\n\n" +
        "Consider using a **state machine** pattern.\n\n" +
        "Use **atomic operations** in MongoDB (like `findOneAndUpdate` with `upsert`).",
    );
    expect(out).toContain("<em>pending</em>");
    expect(out).toContain('<strong class="font-semibold text-foreground">state machine</strong>');
    expect(out).toContain(">findOneAndUpdate</code>");
    expect(out).not.toMatch(/\*\*|`/);
  });

  it("renders headings, lists, quotes, code and tables as structure", () => {
    const out = html(
      "## Approach\n\n1. Validate input\n2. Lock the record\n   - use a version field\n\n> Never trust the client.\n\n```ts\nconst a = 1;\n```\n\n| State | Next |\n| --- | --- |\n| pending | approved |",
    );
    expect(out).toContain(">Approach</p>");
    expect(out).toContain(">1.</span>");
    expect(out).toContain("padding-left:1.1rem");
    expect(out).toContain("<blockquote");
    expect(out).toContain("<pre");
    expect(out).toContain("const a = 1;");
    expect(out).toContain("<table");
    expect(out).toContain(">pending</td>");
    expect(out).not.toContain("##");
  });

  it("keeps snake_case, arithmetic and lone asterisks as plain text", () => {
    const out = html("Call get_user_id(), then compute 2 * 3 * 4.");
    expect(out).toContain("get_user_id()");
    expect(out).toContain("2 * 3 * 4");
    expect(out).not.toContain("<em>");
  });

  it("never emits HTML or unsafe links from the model", () => {
    const out = html('<img src=x onerror="alert(1)"> [click](javascript:alert(1)) [docs](https://example.com)');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noreferrer"');
  });

  it("styles a half-typed bold or code span instead of flashing the markers", () => {
    expect(html("Use a **state mach", true)).toContain(">state mach</strong>");
    expect(html("Call `findOne", true)).toContain(">findOne</code>");
    expect(html("```ts\nconst a", true)).toContain("<pre");
  });
});
