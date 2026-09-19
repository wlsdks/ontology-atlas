import { describe, expect, it } from "vitest";
import { briefOrdinal, splitProjectBrief } from "./project-brief";

describe("splitProjectBrief", () => {
  it("returns the whole body as lead when it has no ## headings", () => {
    const brief = splitProjectBrief("One paragraph.\n\nAnother paragraph.");
    expect(brief.sections).toEqual([]);
    expect(brief.lead).toBe("One paragraph.\n\nAnother paragraph.");
  });

  it("opens a section at every ## heading and keeps deeper headings inside it", () => {
    const brief = splitProjectBrief(
      [
        "Lead line.",
        "",
        "## What it does",
        "A store.",
        "",
        "### Detail",
        "Still the first section.",
        "",
        "## How work flows",
        "1. Browse",
        "2. Buy",
      ].join("\n"),
    );
    expect(brief.lead).toBe("Lead line.");
    expect(brief.sections.map((section) => section.title)).toEqual(["What it does", "How work flows"]);
    expect(brief.sections[0].markdown).toBe("A store.\n\n### Detail\nStill the first section.");
    expect(brief.sections[1].markdown).toBe("1. Browse\n2. Buy");
  });

  it("does not open a section on a ## inside a fenced code block", () => {
    const brief = splitProjectBrief(["## Real", "```md", "## not a heading", "```", "after"].join("\n"));
    expect(brief.sections).toHaveLength(1);
    expect(brief.sections[0].markdown).toBe("```md\n## not a heading\n```\nafter");
  });

  it("trims trailing closing hashes from a heading and tolerates CRLF", () => {
    const brief = splitProjectBrief("## Title ##\r\nbody\r\n");
    expect(brief.sections[0]).toEqual({ title: "Title", markdown: "body" });
  });

  it("handles an empty or missing body", () => {
    expect(splitProjectBrief(null)).toEqual({ lead: "", sections: [] });
    expect(splitProjectBrief("")).toEqual({ lead: "", sections: [] });
  });
});

describe("briefOrdinal", () => {
  it("pads to two digits", () => {
    expect(briefOrdinal(0)).toBe("01");
    expect(briefOrdinal(9)).toBe("10");
  });
});
