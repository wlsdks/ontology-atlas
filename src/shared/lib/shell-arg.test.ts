import { describe, expect, it } from "vitest";
import { shellArg } from "./shell-arg";

describe("shellArg", () => {
  it("일반 값은 작은따옴표로 감싼다", () => {
    expect(shellArg("capabilities/mcp-server")).toBe("'capabilities/mcp-server'");
  });

  it("내부 작은따옴표를 POSIX 방식('\\'')으로 escape", () => {
    expect(shellArg("a'b")).toBe("'a'\\''b'");
  });

  it("빈 문자열 → 빈 따옴표쌍", () => {
    expect(shellArg("")).toBe("''");
  });

  it("공백·특수문자도 따옴표 안에서 안전", () => {
    expect(shellArg("a b; rm -rf")).toBe("'a b; rm -rf'");
  });
});
