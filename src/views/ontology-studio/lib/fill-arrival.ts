import type { StudioBearing } from "./build-studio-item";

/**
 * 채움 확정의 **들어오는 방향** — 새 위성은 자기 소켓이 있던 쪽에서 걸어온다.
 *
 * 2026-07-28 실측: 채움의 절정(제안 선택 → 위성 등장)에서 **아무것도
 * 이동하지 않았다**. 피커·소켓이 0프레임에 사라지고 완성된 위성이 0프레임에
 * 나타난다. 소유자가 이름으로 부른 순간("세팅할때마다 뭔가 움직이면서
 * 표현되는 그런거")이 정확히 여기다.
 *
 * "내가 방금 구조 한 조각을 지었다" 는 감각은 재료가 자리로 *가는* 것을 볼 때
 * 생긴다. 방위마다 들어오는 축이 다르므로 **어느 소켓이 이 위성이 됐는지를
 * 이동이 말한다** — 끄면 그 대응을 잃으므로 장식이 아니다.
 *
 * 나침 방위는 무대의 고정 계약이다(UP=상위개념 · DOWN=담는것 ·
 * RIGHT=기대는곳 · LEFT=비슷한것). 그래서 방향은 취향이 아니라 그 계약에서
 * 따라 나온다 — 위 소켓에서 온 것은 위에서 내려온다.
 */
/** 이동 거리(px). 12px 이내 — 확정의 서명이지 등장 연출이 아니다. */
export const FILL_ARRIVAL_DISTANCE_PX = 12;

/**
 * 도착 표시를 걷는 시각(ms) — `--motion-settle`(240) 보다 넉넉히 잡아 애니메이션이
 * 끝난 뒤에 지운다. 안 걷으면 이후의 재렌더가 같은 위성을 다시 도착시킨다.
 */
export const FILL_ARRIVAL_WINDOW_MS = 400;

export interface FillArrivalOffset {
  "--studio-fill-from-x": string;
  "--studio-fill-from-y": string;
}

/**
 * 그 방위에서 들어오는 시작 오프셋. 위 방위면 **위쪽**에서(-y) 내려오고,
 * 왼쪽 방위면 **왼쪽**에서(-x) 들어온다 — 소켓이 있던 자리가 출발점이다.
 */
export function fillArrivalOffset(bearing: StudioBearing): FillArrivalOffset {
  const d = FILL_ARRIVAL_DISTANCE_PX;
  switch (bearing) {
    case "up":
      return { "--studio-fill-from-x": "0px", "--studio-fill-from-y": `${-d}px` };
    case "down":
      return { "--studio-fill-from-x": "0px", "--studio-fill-from-y": `${d}px` };
    case "left":
      return { "--studio-fill-from-x": `${-d}px`, "--studio-fill-from-y": "0px" };
    case "right":
      return { "--studio-fill-from-x": `${d}px`, "--studio-fill-from-y": "0px" };
  }
}
