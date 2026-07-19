import { describe, expect, it } from "vitest";
import { extractProjectBody } from "./resolve-project-body";

describe("extractProjectBody", () => {
  it("frontmatter 를 스트립하고 본문만 반환한다", () => {
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

  it("frontmatter 가 없어도 본문 그대로 반환한다 (legacy 파일 호환)", () => {
    expect(extractProjectBody("그냥 본문")).toBe("그냥 본문");
  });

  it("본문이 공백뿐이면 undefined (본문 없음 UI 분기와 일치)", () => {
    const raw = ["---", "kind: project", "---", "", "   \n\n  "].join("\n");
    expect(extractProjectBody(raw)).toBeUndefined();
  });

  it("null / undefined / 빈 문자열 입력은 undefined", () => {
    expect(extractProjectBody(null)).toBeUndefined();
    expect(extractProjectBody(undefined)).toBeUndefined();
    expect(extractProjectBody("")).toBeUndefined();
  });
});
