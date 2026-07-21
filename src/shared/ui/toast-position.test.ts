import { describe, expect, it } from "vitest";
import {
  BUILDER_WRITE_BAR_RESERVE_PX,
  TOAST_EDGE_GAP_PX,
  resolveToastBottomOffset,
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
});
