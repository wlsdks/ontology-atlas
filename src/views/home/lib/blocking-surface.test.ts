import { describe, expect, it } from "vitest";

import { shouldSuppressGlobalShortcuts } from "./blocking-surface";

describe("shouldSuppressGlobalShortcuts", () => {
  it("아무 블로킹 표면도 없으면 전역 단축키가 산다", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, tourOpen: false, agentAwaitingDecision: false })).toBe(false);
  });

  it("개념 추가 컴포저가 열려 있으면 단축키를 삼킨다 (기존 계약)", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, tourOpen: false, agentAwaitingDecision: false })).toBe(true);
  });

  // Measured regression: pressing `?` during the tour stacked the shortcut modal
  // over the tour card — two live role="dialog" surfaces. The tour is a blocking
  // surface with its own blocker and focus trap, so it takes the same rule.
  it("가이드 투어가 열려 있어도 단축키를 삼킨다 — 두 오버레이 동시 개방 차단", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, tourOpen: true, agentAwaitingDecision: false })).toBe(true);
  });

  // Measured 2026-08-24 on the installed app: with a permission card waiting for an answer, a bare
  // `d` opened the documents drawer over it, and Escape then reached the card rather than the
  // drawer — the person could neither decide nor clear what was covering the decision.
  it("에이전트가 승인을 기다리는 동안에는 단축키를 삼킨다 — 결정 위에 다른 표면이 덮이면 안 된다", () => {
    expect(
      shouldSuppressGlobalShortcuts({
        createNodeOpen: false,
        tourOpen: false,
        agentAwaitingDecision: true,
      }),
    ).toBe(true);
  });

  it("둘 다 열려 있어도 마찬가지", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, tourOpen: true, agentAwaitingDecision: false })).toBe(true);
  });
});
