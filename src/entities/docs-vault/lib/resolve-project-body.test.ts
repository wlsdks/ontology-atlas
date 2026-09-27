import { describe, expect, it } from "vitest";
import { extractProjectBody } from "./resolve-project-body";

describe("extractProjectBody", () => {
  it("strips frontmatter and returns the body", () => {
    const raw = [
      "---",
      "kind: project",
      "title: demo",
      "---",
      "",
      "# demo",
      "",
      "실제 본문 내용입니다.",
    ].join("\n");

    expect(extractProjectBody(raw)).toBe("# demo\n\n실제 본문 내용입니다.");
  });

  it("returns the body of a file without frontmatter", () => {
    expect(extractProjectBody("그냥 본문")).toBe("그냥 본문");
  });

  it("returns undefined for a whitespace-only body", () => {
    const raw = ["---", "kind: project", "---", "", "   \n\n  "].join("\n");
    expect(extractProjectBody(raw)).toBeUndefined();
  });

  it("returns undefined for null, undefined or empty input", () => {
    expect(extractProjectBody(null)).toBeUndefined();
    expect(extractProjectBody(undefined)).toBeUndefined();
    expect(extractProjectBody("")).toBeUndefined();
  });
});
