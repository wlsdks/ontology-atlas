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

/**
 * **알림이 오른쪽 도크를 비켜선다** (2026-08-16 소유자 화면).
 *
 * 「만들었어요」 토스트가 대화 패널의 작성 칸 위에 그대로 얹혔다. 하단에서
 * 이미 풀어 둔 문제와 **같은 모양**이다 — 화면 가장자리를 기준으로 서는 것은
 * 그 가장자리에 무엇이 서든 그 위에 앉는다.
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
    // 이 패널의 폭은 320~968 사이에서 사용자가 정한다. 한 수를 박으면
    // 그 수에서만 맞고 나머지 폭 전부에서 틀린다.
    expect(resolveToastRightOffset(968)).toBe(TOAST_EDGE_GAP_PX + 968);
    expect(resolveToastRightOffset(320)).toBe(TOAST_EDGE_GAP_PX + 320);
  });

  it("음수는 없던 일로 친다 — 화면 밖으로 밀지 않는다", () => {
    expect(resolveToastRightOffset(-100)).toBe(TOAST_EDGE_GAP_PX);
  });
});
