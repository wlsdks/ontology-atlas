import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 지도 검사 훅(`window.__atlasMap`)의 계약.
 *
 * ## 왜 계약 테스트인가
 *
 * 이 훅은 **자동화가 지도를 밖에서 구분하기 위한 유일한 창구**다. 창구가 조용히
 * 사라지거나 게이트가 풀리면 두 가지가 각각 나쁘게 실패한다:
 *
 * - 창구가 사라지면 → 하네스가 "노드를 못 찾음" 으로 죽는 게 아니라 **옛 방식
 *   (커서 훑기)으로 되돌아가 배경을 밀며 «안 느린데요» 를 낸다.** 2026-07-31 에
 *   그 오답을 여섯 번 냈다.
 * - 게이트(`e2e` 쿼리)가 풀리면 → 진단 창구가 **모든 사용자에게** 붙는다.
 *
 * lint 로는 못 잡는다 — 값 규칙이 아니라 «이 코드가 존재하고 조건부인가» 라서다.
 */
const LOOP = join(
  process.cwd(),
  "src/widgets/topology-map-v2/ui/use-topology-loop.ts",
);

const source = readFileSync(LOOP, "utf8");

describe("지도 검사 훅 (window.__atlasMap)", () => {
  it("`e2e` 쿼리가 있을 때만 붙는다 — 상시 노출이 아니다", () => {
    expect(source).toContain("__atlasMap");
    // 게이트가 이 형태여야 한다. 조건을 지우면 진단 창구가 제품 표면이 된다.
    expect(source).toMatch(/URLSearchParams\(window\.location\.search\)\.has\("e2e"\)/);
  });

  it("창구를 걷어낸다 — 언마운트 뒤 전역에 남지 않는다", () => {
    expect(source).toMatch(/delete \(window as unknown as \{ __atlasMap\?: typeof hook \}\)\.__atlasMap/);
  });

  /**
   * 이 목록이 곧 「밖에서 구분 가능한 것」의 사정거리다. 하나가 빠지면 그만큼
   * 자동 검사의 사각지대가 생기고, 그 사각지대에서 사람이 대신 화면을 봐야 한다.
   */
  const REQUIRED_ACCESSORS = [
    "nodes:", // 무엇이 어디에 있고 무엇을 끌 수 있나
    "edges:", // 선이 어디로 지나가나 — 지도가 «그래프로서» 읽히는지의 유일한 입력
    "interaction:", // 지금 끄는 것이 노드인가 배경인가 ← 사고의 핵심
    "backing:", // 해상도 캡이 실제로 걸렸나
    "camera:", // 지도가 어디를 보고 있나
    "selection:", // 무엇이 골라져 있나
    "chips:", // 칩의 주장과 실제가 같은가
  ] as const;

  it.each(REQUIRED_ACCESSORS)("`%s` 창구가 있다", (accessor) => {
    expect(source).toContain(accessor);
  });

  it("엣지는 컨트롤 포인트까지 낸다 — 현선을 재면 화면에 없는 교차를 센다", () => {
    // 드로우 경로는 `quadraticCurveTo` 다. 끝점만 노출하면 가독성 계기가 지도가
    // 아니라 자기 근사치를 재게 되고, 그 오차는 조용하다(숫자가 나오니까).
    // 3D 보기(2026-08-18)부터 컨트롤 포인트도 드로우(`projectEdgePoints`)와
    // 같은 끝점 오프셋 평균을 탄다 — 꺼져 있으면 오프셋 0 으로 종전과 동일.
    expect(source).toContain("controlX: toScreenX(e.controlX + (offA.dx + offB.dx) / 2)");
    expect(source).toContain("controlY: toScreenY(e.controlY + (offA.dy + offB.dy) / 2)");
  });

  it("노드는 화면 반지름을 낸다 — 겹침은 반지름 없이 셀 수 없다", () => {
    // 그리는 쪽과 **같은 식**이어야 한다: radiusForKind × magnitudeScale × 카메라
    // 배율 (× 3D 프레임의 원근 배율 s — 드로우와 동일, 2D 는 1).
    expect(source).toMatch(
      /radius:\s*tokens\s*\n?\s*\?\s*radiusForKind\(n\.kind, tokens\) \*\s*\n?\s*n\.magnitudeScale \*\s*\n?\s*camera\.scale\.value \*\s*\n?\s*dOff\.s/,
    );
  });

  it("`draggable` 을 노출한다 — 호버 히트와 «잡히는지» 는 다르다", () => {
    // 커서가 pointer 여도 시뮬에 없으면 잡기가 실패하고 조용히 팬이 된다.
    // 이 필드가 없으면 하네스는 그 차이를 볼 수 없고, 그게 정확히 그 사고다.
    expect(source).toMatch(/draggable:\s*sim\?\.hasNode/);
  });

  it("칩은 주장과 실제를 나란히 낸다", () => {
    // `claimedCount` 만 있고 `shownChildren` 이 없으면 「+24 라 써 놓고 1개만
    // 그린다」는 어긋남이 밖에서 안 보인다 — 실제로 있었던 결함이다.
    expect(source).toContain("claimedCount");
    expect(source).toContain("shownChildren");
  });
});
