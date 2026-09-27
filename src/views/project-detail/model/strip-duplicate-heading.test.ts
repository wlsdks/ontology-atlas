import { describe, expect, it } from "vitest";
import { stripDuplicateHeading } from "./strip-duplicate-heading";

describe("stripDuplicateHeading draws the title once", () => {
  it("removes a first h1 that equals the title", () => {
    expect(stripDuplicateHeading("# 온라인 쇼핑몰\n\n본문이 이어진다.", "온라인 쇼핑몰")).toBe(
      "본문이 이어진다.",
    );
  });

  it("finds it after leading blank lines", () => {
    expect(stripDuplicateHeading("\n\n# 이름\n\n본문.", "이름")).toBe("본문.");
  });

  it("applies the same rule to h2", () => {
    expect(stripDuplicateHeading("## 이름\n\n본문.", "이름")).toBe("본문.");
  });

  it("keeps a different heading", () => {
    const body = "# 다른 제목\n\n본문.";
    expect(stripDuplicateHeading(body, "이름")).toBe(body);
  });

  // A heading with the same name in the middle of the body is a meaningful section there.
  it("keeps a same-name heading in the middle of the body", () => {
    const body = "앞선 문단.\n\n# 이름\n\n뒷 문단.";
    expect(stripDuplicateHeading(body, "이름")).toBe(body);
  });

  it("does nothing when the title is empty", () => {
    const body = "# 이름\n\n본문.";
    expect(stripDuplicateHeading(body, "")).toBe(body);
    expect(stripDuplicateHeading(body, null)).toBe(body);
  });

  it("returns null for a missing body", () => {
    expect(stripDuplicateHeading(null, "이름")).toBeNull();
    expect(stripDuplicateHeading("", "이름")).toBe("");
  });

  it("handles a heading with nothing after it", () => {
    expect(stripDuplicateHeading("# 이름", "이름")).toBe("");
  });
});
