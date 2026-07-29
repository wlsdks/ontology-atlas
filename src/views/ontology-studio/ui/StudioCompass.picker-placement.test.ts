import { describe, expect, it } from "vitest";

import { placePicker } from "./StudioCompass";
import type { StudioBearing } from "../lib/build-studio-item";

/**
 * **네 방위가 같은 크기의 고를 자리를 받는다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-07-29 도그푸딩)
 *
 * 좌우 소켓의 피커만 "소켓 아래로" 열렸다. 좌우 소켓은 무대 세로 중앙에 앉으니
 * 아래로만 열면 판의 절반만 쓸 수 있고, 크롬(머리말+검색+새로 만들기)이 126px 를
 * 먼저 가져간 뒤 **목록에 96px 가 남았다 — 여덟 줄 중 2.67줄**, 세 번째 줄은
 * 글자 중간에서 잘렸다. 고르라고 연 표면에서 고를 것이 화면의 43% 였고, 바로
 * 위 260px 는 비어 있었다.
 *
 * 위/아래 방위는 처음부터 판 전체 높이를 쓰고 있었다 — **한 표면 안에서 두
 * 규칙이 공존**했고, 그 대가를 목록이 냈다.
 *
 * ## 왜 값이 아니라 불변식을 재나
 *
 * "목록이 258px 다" 는 크롬 규격이 바뀌면 같이 바뀌어야 하는 값이라 게이트로
 * 걸면 정상 변경마다 깨진다. 깨지면 안 되는 것은 **방위끼리 다르면 안 된다**
 * 는 쪽이다.
 */

const BOARD_H = 600;
const PAD = 8;

/** 무대 위 실측 좌표(1512×900 뷰포트, 2026-07-29). */
const SOCKETS: Record<StudioBearing, { x: number; y: number; w: number; h: number }> = {
  up: { x: 478, y: 54, w: 224, h: 82 },
  right: { x: 904, y: 268, w: 204, h: 64 },
  down: { x: 488, y: 464, w: 204, h: 64 },
  left: { x: 72, y: 268, w: 204, h: 83 },
};

const CARD_LEFT = 404;
const CARD_RIGHT = 776;

const BEARINGS = Object.keys(SOCKETS) as StudioBearing[];

describe("공방 피커 배치 — 방위가 목록 높이를 정하지 않는다", () => {
  const placed = BEARINGS.map((bearing) => ({
    bearing,
    ...placePicker(bearing, SOCKETS[bearing], CARD_LEFT, CARD_RIGHT),
  }));

  it("네 방위가 모두 같은 높이를 받는다", () => {
    const heights = new Set(placed.map((p) => p.maxHeight));
    expect(
      heights.size,
      `방위별 높이: ${placed.map((p) => `${p.bearing}=${p.maxHeight}`).join(" · ")}\n` +
        `한 방위만 짧으면 그 방위에서만 목록이 잘린다 — 좌우가 96px 를 받던 회귀가 정확히 이 형태였다.`,
    ).toBe(1);
  });

  it.each(BEARINGS)("%s 패널이 판 밖으로 나가지 않는다", (bearing) => {
    const p = placed.find((x) => x.bearing === bearing)!;
    expect(p.top).toBeGreaterThanOrEqual(PAD);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(BOARD_H - PAD);
  });

  /**
   * 크롬 126px 를 뺀 뒤에도 **여섯 줄(36px)** 은 남아야 한다. 회귀 당시 값은
   * 2.67줄이었다 — 이 하한이 "고를 것이 화면에 있다" 의 최소치다.
   */
  it("크롬을 뺀 목록이 여섯 줄 아래로 내려가지 않는다", () => {
    const PICKER_CHROME = 126;
    const ROW = 36;
    for (const p of placed) {
      expect(
        (p.maxHeight - PICKER_CHROME) / ROW,
        `${p.bearing}: 목록 ${p.maxHeight - PICKER_CHROME}px = ${((p.maxHeight - PICKER_CHROME) / ROW).toFixed(1)}줄`,
      ).toBeGreaterThanOrEqual(6);
    }
  });
});
