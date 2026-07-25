import { describe, expect, it } from "vitest";

import { shouldSuppressGlobalShortcuts } from "./blocking-surface";

describe("shouldSuppressGlobalShortcuts", () => {
  it("아무 블로킹 표면도 없으면 전역 단축키가 산다", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, tourOpen: false })).toBe(false);
  });

  it("개념 추가 컴포저가 열려 있으면 단축키를 삼킨다 (기존 계약)", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, tourOpen: false })).toBe(true);
  });

  // opus5 검수 실측 회귀: 투어가 열린 채 `?` 를 누르면 단축키 모달이 투어 카드
  // 위에 겹쳐 떴다 — role="dialog" 두 개 동시 개방. 투어도 자체 blocker/포커스
  // 트랩을 가진 블로킹 표면이므로 같은 규칙을 받는다.
  it("가이드 투어가 열려 있어도 단축키를 삼킨다 — 두 오버레이 동시 개방 차단", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, tourOpen: true })).toBe(true);
  });

  it("둘 다 열려 있어도 마찬가지", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, tourOpen: true })).toBe(true);
  });
});
