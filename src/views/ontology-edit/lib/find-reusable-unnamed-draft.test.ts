import { describe, expect, it } from "vitest";
import { findReusableUnnamedDraft } from "./find-reusable-unnamed-draft";

const PLACEHOLDER = "(이름 입력)";

describe("findReusableUnnamedDraft", () => {
  it("미명명 드래프트가 있으면 그 id 를 돌려준다 (새 드래프트 생성 대신 재선택)", () => {
    const nodes = [
      { id: "vault-a", title: "Auth Platform" },
      { id: "ephemeral-1", title: PLACEHOLDER },
    ];
    expect(findReusableUnnamedDraft(nodes, PLACEHOLDER)).toBe("ephemeral-1");
  });

  it("빈 title 도 미명명으로 본다", () => {
    expect(
      findReusableUnnamedDraft([{ id: "ephemeral-1", title: "   " }], PLACEHOLDER),
    ).toBe("ephemeral-1");
  });

  it("모든 노드에 이름이 있으면 null — 새 드래프트를 만들어도 안전", () => {
    const nodes = [
      { id: "ephemeral-1", title: "도메인 A" },
      { id: "ephemeral-2", title: "역량 B" },
    ];
    expect(findReusableUnnamedDraft(nodes, PLACEHOLDER)).toBeNull();
  });

  it("빈 목록이면 null", () => {
    expect(findReusableUnnamedDraft([], PLACEHOLDER)).toBeNull();
  });

  it("여러 미명명이 쌓인 레거시 상태에선 첫 번째를 돌려준다", () => {
    const nodes = [
      { id: "ephemeral-1", title: PLACEHOLDER },
      { id: "ephemeral-2", title: PLACEHOLDER },
    ];
    expect(findReusableUnnamedDraft(nodes, PLACEHOLDER)).toBe("ephemeral-1");
  });
});
