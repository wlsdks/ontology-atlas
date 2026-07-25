import { describe, expect, it } from "vitest";
import { stripDuplicateHeading } from "./strip-duplicate-heading";

describe("stripDuplicateHeading — 제목을 두 번 그리지 않는다", () => {
  it("첫 h1 이 제목과 같으면 뗀다", () => {
    expect(stripDuplicateHeading("# 온라인 쇼핑몰\n\n본문이 이어진다.", "온라인 쇼핑몰")).toBe(
      "본문이 이어진다.",
    );
  });

  it("앞 빈 줄이 있어도 찾아낸다", () => {
    expect(stripDuplicateHeading("\n\n# 이름\n\n본문.", "이름")).toBe("본문.");
  });

  it("h2 도 같은 규칙", () => {
    expect(stripDuplicateHeading("## 이름\n\n본문.", "이름")).toBe("본문.");
  });

  it("다른 제목이면 그대로 둔다", () => {
    const body = "# 다른 제목\n\n본문.";
    expect(stripDuplicateHeading(body, "이름")).toBe(body);
  });

  // 중간의 같은 이름 헤딩은 그 자리에서 뜻이 있는 구획이다.
  it("본문 가운데의 같은 이름 헤딩은 건드리지 않는다", () => {
    const body = "앞선 문단.\n\n# 이름\n\n뒷 문단.";
    expect(stripDuplicateHeading(body, "이름")).toBe(body);
  });

  it("제목이 비면 아무것도 하지 않는다", () => {
    const body = "# 이름\n\n본문.";
    expect(stripDuplicateHeading(body, "")).toBe(body);
    expect(stripDuplicateHeading(body, null)).toBe(body);
  });

  it("본문이 없으면 null", () => {
    expect(stripDuplicateHeading(null, "이름")).toBeNull();
    expect(stripDuplicateHeading("", "이름")).toBe("");
  });

  it("헤딩만 있고 뒤가 비어도 안전하다", () => {
    expect(stripDuplicateHeading("# 이름", "이름")).toBe("");
  });
});
