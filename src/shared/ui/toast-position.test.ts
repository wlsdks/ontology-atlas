import { describe, expect, it } from "vitest";
import {
  BUILDER_WRITE_BAR_RESERVE_PX,
  TOAST_EDGE_GAP_PX,
  resolveToastBottomOffset,
  resolveToastBottomOffsetForStack,
  resolveToastRightOffset,
} from "./toast-position";

describe("resolveToastBottomOffset", () => {
  it("예약 높이가 없으면 기본 가장자리 여백만 반환", () => {
    expect(resolveToastBottomOffset(0)).toBe(TOAST_EDGE_GAP_PX);
    expect(resolveToastBottomOffset()).toBe(TOAST_EDGE_GAP_PX);
  });

  it("예약 높이만큼 위로 띄운다 (여백 + 예약)", () => {
    expect(resolveToastBottomOffset(BUILDER_WRITE_BAR_RESERVE_PX)).toBe(
      TOAST_EDGE_GAP_PX + BUILDER_WRITE_BAR_RESERVE_PX,
    );
  });

  it("포지션 계약 — 1440×900 에서 토스트 하단이 하단 쓰기 바(≈54px)를 비켜난다", () => {
    // Real bar height (button h-8 + py-2.5 + border) ≈ 54px, plus the gap above it.
    const ACTUAL_WRITE_BAR_HEIGHT = 54;
    const toastBottom = resolveToastBottomOffset(BUILDER_WRITE_BAR_RESERVE_PX);
    // The toast's bottom offset must exceed bar height + minimum gap, or it covers the button.
    expect(toastBottom).toBeGreaterThan(ACTUAL_WRITE_BAR_HEIGHT + TOAST_EDGE_GAP_PX);
  });

  it("음수 예약은 0 으로 클램프", () => {
    expect(resolveToastBottomOffset(-100)).toBe(TOAST_EDGE_GAP_PX);
  });

  describe("resolveToastBottomOffsetForStack — 지도 우하단 계기 스택 (E-7)", () => {
    it("스택 상단 위로 토스트를 띄운다", () => {
      // 1512×950, 24px corner inset, 40px stack height → stack top = 950-24-40 = 886.
      const offset = resolveToastBottomOffsetForStack(950, 886);
      expect(offset).toBe(TOAST_EDGE_GAP_PX + 64);
      // The toast's bottom (offset) must sit above the stack's top (950-886=64) to avoid overlap.
      expect(offset).toBeGreaterThan(950 - 886);
    });

    it("≥1920 의 커진 코너 인셋도 실측 rect 로 따라간다", () => {
      // At a 32px inset the stack's top rises and the offset grows with it.
      expect(resolveToastBottomOffsetForStack(1080, 1080 - 32 - 40)).toBe(
        TOAST_EDGE_GAP_PX + 72,
      );
    });

    it("스택이 화면 밖(top > viewport)이면 기본 여백으로 클램프", () => {
      expect(resolveToastBottomOffsetForStack(950, 1200)).toBe(TOAST_EDGE_GAP_PX);
    });
  });
});

/**
 * **Notifications step aside for the right dock** (from the owner's screen,
 * 2026-08-16).
 *
 * The 「만들었어요」 (created) toast landed directly on the conversation panel's
 * composer. It is **the same shape** as the problem already solved at the bottom
 * edge: anything positioned against a viewport edge sits on top of whatever
 * stands at that edge.
 */
describe("토스트 오른쪽 오프셋 — 도크를 비켜선다", () => {
  it("도크가 없으면 기본 여백뿐이다 — 회귀 0", () => {
    expect(resolveToastRightOffset()).toBe(TOAST_EDGE_GAP_PX);
    expect(resolveToastRightOffset(0)).toBe(TOAST_EDGE_GAP_PX);
  });

  it("도크 폭만큼 밀어낸다 — 기본 420px 패널", () => {
    expect(resolveToastRightOffset(420)).toBe(TOAST_EDGE_GAP_PX + 420);
  });

  it("사용자가 끌어 넓힌 폭도 그대로 따라간다 — 상수가 아니다", () => {
    // The user sets this panel's width anywhere from 320 to 968. Pinning one
    // number is correct at that number and wrong at every other width.
    expect(resolveToastRightOffset(968)).toBe(TOAST_EDGE_GAP_PX + 968);
    expect(resolveToastRightOffset(320)).toBe(TOAST_EDGE_GAP_PX + 320);
  });

  it("음수는 없던 일로 친다 — 화면 밖으로 밀지 않는다", () => {
    expect(resolveToastRightOffset(-100)).toBe(TOAST_EDGE_GAP_PX);
  });
});
