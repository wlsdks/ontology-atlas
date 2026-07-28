import { describe, expect, it } from "vitest";
import { STUDIO_BOARD_WIDTH, studioBoardScale } from "./board-scale";

/**
 * 실측값을 그대로 케이스로 쓴다 (2026-07-28, 프로덕션 :4173). 뷰포트가 아니라
 * **무대 콘텐츠 폭**이 입력이다 — 레일 64px 이 이미 빠진 값.
 */
describe("studioBoardScale — 보드가 화면 밖으로 잘리지 않는다", () => {
  it("넉넉한 폭에서는 손대지 않는다 (1:1)", () => {
    // 1264 뷰포트 = 무대 1200. 여기서부터 여백이 생겨 잘림이 없었다.
    expect(studioBoardScale(1200)).toBe(1);
    expect(studioBoardScale(1448)).toBe(1);
  });

  it("잘리던 대역에서 딱 들어가게 줄인다", () => {
    // 1024 뷰포트 = 무대 960. 종전에는 한쪽 110px 씩 잘렸다.
    const scale = studioBoardScale(960);
    expect(scale).toBeLessThan(1);
    expect(scale * STUDIO_BOARD_WIDTH).toBeLessThanOrEqual(960);
  });

  it("설치 앱의 최소 폭(1040)에서도 다 들어간다", () => {
    // 앱 minWidth 1040 → 무대 976. 이 폭이 강등 대신 축소를 고른 이유다.
    const scale = studioBoardScale(976);
    expect(scale * STUDIO_BOARD_WIDTH).toBeLessThanOrEqual(976);
    expect(scale).toBeGreaterThan(0.8);
  });

  // 측정 전 프레임이 축소로 깜빡이면, 고치려던 것보다 눈에 띄는 결함이 된다.
  it("측정 전(0·NaN)에는 축소하지 않는다", () => {
    expect(studioBoardScale(0)).toBe(1);
    expect(studioBoardScale(Number.NaN)).toBe(1);
    expect(studioBoardScale(-100)).toBe(1);
  });

  // 바닥 밑은 폭 강등의 몫이다 — 무한히 줄여 글자를 못 읽게 만들지 않는다.
  it("바닥 아래로는 줄이지 않는다", () => {
    expect(studioBoardScale(200)).toBeGreaterThanOrEqual(0.78);
  });

  it("폭이 줄면 배율도 단조 감소한다", () => {
    const widths = [900, 960, 1040, 1100, 1200];
    const scales = widths.map((w) => studioBoardScale(w));
    for (let i = 1; i < scales.length; i += 1) {
      expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
    }
  });
});
