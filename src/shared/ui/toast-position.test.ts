import { describe, expect, it } from "vitest";
import {
  BUILDER_WRITE_BAR_RESERVE_PX,
  TOAST_EDGE_GAP_PX,
  resolveToastBottomOffset,
  resolveToastBottomOffsetForStack,
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
    // 실제 바 높이(버튼 h-8 + py-2.5 + border) ≈ 54px + 바 위 gap.
    const ACTUAL_WRITE_BAR_HEIGHT = 54;
    const toastBottom = resolveToastBottomOffset(BUILDER_WRITE_BAR_RESERVE_PX);
    // 토스트 하단 오프셋이 바 높이 + 최소 여백보다 커야 버튼을 안 가린다.
    expect(toastBottom).toBeGreaterThan(ACTUAL_WRITE_BAR_HEIGHT + TOAST_EDGE_GAP_PX);
  });

  it("음수 예약은 0 으로 클램프", () => {
    expect(resolveToastBottomOffset(-100)).toBe(TOAST_EDGE_GAP_PX);
  });

  describe("resolveToastBottomOffsetForStack — 지도 우하단 계기 스택 (E-7)", () => {
    it("스택 상단 위로 토스트를 띄운다", () => {
      // 1512×950, 코너 인셋 24px, 스택 높이 40px → 스택 top = 950-24-40 = 886.
      const offset = resolveToastBottomOffsetForStack(950, 886);
      expect(offset).toBe(TOAST_EDGE_GAP_PX + 64);
      // 토스트 하단(offset)이 스택 상단(950-886=64)보다 위여야 겹치지 않는다.
      expect(offset).toBeGreaterThan(950 - 886);
    });

    it("≥1920 의 커진 코너 인셋도 실측 rect 로 따라간다", () => {
      // 인셋 32px 로 커지면 스택 top 이 올라가고 오프셋도 함께 커진다.
      expect(resolveToastBottomOffsetForStack(1080, 1080 - 32 - 40)).toBe(
        TOAST_EDGE_GAP_PX + 72,
      );
    });

    it("스택이 화면 밖(top > viewport)이면 기본 여백으로 클램프", () => {
      expect(resolveToastBottomOffsetForStack(950, 1200)).toBe(TOAST_EDGE_GAP_PX);
    });
  });
});
