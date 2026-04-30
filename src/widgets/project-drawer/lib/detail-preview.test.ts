import { describe, expect, it } from "vitest";
import { getProjectDetailPreview } from "./detail-preview";

describe("getProjectDetailPreview", () => {
  it("returns empty preview for blank detail", () => {
    expect(getProjectDetailPreview("   \n  ")).toEqual({
      blocks: [],
      hasMore: false,
    });
  });

  it("keeps fenced code block lines together", () => {
    const detail = [
      "## Intro",
      "",
      "첫 문단",
      "",
      "```ts",
      "const foo = 1;",
      "",
      "console.log(foo);",
      "```",
      "",
      "마지막 문단",
    ].join("\n");

    expect(getProjectDetailPreview(detail)).toEqual({
      blocks: [
        "## Intro",
        "첫 문단",
        "```ts\nconst foo = 1;\n\nconsole.log(foo);\n```",
      ],
      hasMore: true,
    });
  });

  it("limits blocks by maxBlocks", () => {
    const detail = ["one", "two", "three", "four"].join("\n\n");

    expect(getProjectDetailPreview(detail, 2)).toEqual({
      blocks: ["one", "two"],
      hasMore: true,
    });
  });
});
