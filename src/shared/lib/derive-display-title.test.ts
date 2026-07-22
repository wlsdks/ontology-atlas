import { describe, expect, it } from "vitest";
import { deriveDisplayTitle } from "./derive-display-title";

describe("deriveDisplayTitle", () => {
  it("frontmatter display 필드가 있으면 title 과 무관하게 그것을 우선한다", () => {
    expect(
      deriveDisplayTitle({ display: "짧은 이름" }, "CLI Developer Entry (49 commands)"),
    ).toBe("짧은 이름");
  });

  it("display 필드가 공백뿐이면 무시하고 title 규칙으로 폴백한다", () => {
    expect(deriveDisplayTitle({ display: "   " }, "Short Title")).toBe(
      "Short Title",
    );
  });

  it("영문 title 의 괄호 부연 설명을 컷한다", () => {
    expect(
      deriveDisplayTitle(
        undefined,
        "CLI Developer Entry (49 commands — vault + MCP verify + ...)",
      ),
    ).toBe("CLI Developer Entry");
  });

  it("한글 title 의 괄호 부연 설명도 동일 규칙으로 컷한다", () => {
    expect(
      deriveDisplayTitle(null, "MCP 서버 (25개 도구 — 읽기 16 + 쓰기 9)"),
    ).toBe("MCP 서버");
  });

  it("괄호가 없는 title 은 그대로 반환한다", () => {
    expect(deriveDisplayTitle(undefined, "Auth Platform")).toBe("Auth Platform");
  });

  it("frontmatter 가 없어도(undefined/null) title 규칙만으로 동작한다", () => {
    expect(deriveDisplayTitle(undefined, "Vault (Local-First)")).toBe("Vault");
    expect(deriveDisplayTitle(null, "Vault (Local-First)")).toBe("Vault");
  });

  it("괄호가 title 맨 앞에 있으면(공백 접두 없음) 컷 규칙이 적용되지 않는다", () => {
    expect(deriveDisplayTitle(undefined, "(주의) 임시 이름")).toBe(
      "(주의) 임시 이름",
    );
  });

  it("괄호가 여러 개면 첫 번째 것만 기준으로 자른다", () => {
    expect(deriveDisplayTitle(undefined, "A (b) (c)")).toBe("A");
  });

  it("frontmatter.display 가 문자열이 아니면(예: 배열) 무시한다", () => {
    expect(
      deriveDisplayTitle({ display: ["짧은 이름"] }, "Full Title (extra)"),
    ).toBe("Full Title");
  });
});
