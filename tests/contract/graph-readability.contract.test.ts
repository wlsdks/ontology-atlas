import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { measureReadability } from "../../scripts/lib/graph-readability.mjs";

/**
 * 그래프 가독성 계기의 **프로브**.
 *
 * ## 왜 이 파일이 계기와 같은 PR 에 있는가
 *
 * `/gate-probe`: **항상 통과하기만 하는 게이트는 게이트가 없는 것과 구별되지
 * 않는다.** 이 계기의 첫 실측이 정확히 그 자리에 섰다 — 세 케이스 모두 겹침 0 이
 * 나왔는데, 그 0 이 「지도가 안 겹친다」인지 「탐지기가 놀고 있다」인지 브라우저
 * 실측만으로는 영원히 알 수 없다. 아는 답을 넣어 볼 수가 없기 때문이다.
 *
 * 그래서 계산을 페이지 밖 순수 함수로 떼어냈고, 여기서 **아는 답**을 넣는다.
 * 각 it 은 「이 상황이면 반드시 이 수치」다 — 하나라도 0 을 돌려주면 그 탐지기는
 * 죽은 것이다.
 *
 * 근거: Purchase, *"Which Aesthetic has the Greatest Effect on Human
 * Understanding?"*, Graph Drawing 1997 — 엣지 교차 최소화가 인간 이해도에
 * 압도적으로 가장 중요했고 각도 해상도·격자 스냅은 유의하지 않았다. 그래서
 * 이 계기는 교차와 겹침 둘만 재고, 이 프로브도 그 둘만 증명한다.
 */

const VIEW = { width: 1000, height: 1000 };
const node = (id: string, x: number, y: number, radius = 10) => ({ id, x, y, radius });
/** 컨트롤 포인트 없는 엣지는 직선으로 취급된다 — 프로브는 그 경로를 쓴다. */
const edge = (
  sourceId: string,
  targetId: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  control?: [number, number],
) => ({
  sourceId,
  targetId,
  ax,
  ay,
  bx,
  by,
  ...(control ? { controlX: control[0], controlY: control[1] } : {}),
});

describe("엣지 교차 탐지", () => {
  it("X 자로 만나는 두 엣지를 1 로 센다 — 이게 0 이면 탐지기가 죽은 것이다", () => {
    const r = measureReadability({
      nodes: [node("a", 100, 100), node("b", 300, 300), node("c", 300, 100), node("d", 100, 300)],
      edges: [edge("a", "b", 100, 100, 300, 300), edge("c", "d", 300, 100, 100, 300)],
      ...VIEW,
    });
    expect(r.crossings).toBe(1);
    expect(r.crossingMeasurable).toBe(true);
    expect(r.crossingQuality).toBe(0); // 가능한 교차 1건 중 1건이 실제로 났다
  });

  it("나란한 두 엣지는 0 이다 — 아무거나 교차라고 부르지 않는다", () => {
    const r = measureReadability({
      nodes: [node("a", 100, 100), node("b", 300, 100), node("c", 100, 200), node("d", 300, 200)],
      edges: [edge("a", "b", 100, 100, 300, 100), edge("c", "d", 100, 200, 300, 200)],
      ...VIEW,
    });
    expect(r.crossings).toBe(0);
    expect(r.crossingQuality).toBe(1);
  });

  it("한 노드에서 뻗은 두 엣지는 교차가 아니다 — 그건 그래프의 정의다", () => {
    // 세면 차수 높은 노드를 가진 그래프가 배치와 무관하게 나쁘게 나온다.
    const r = measureReadability({
      nodes: [node("hub", 200, 200), node("a", 100, 100), node("b", 300, 100)],
      edges: [edge("hub", "a", 200, 200, 100, 100), edge("hub", "b", 200, 200, 300, 100)],
      ...VIEW,
    });
    expect(r.crossings).toBe(0);
    // 그리고 그 쌍은 **가능한 교차**에서도 빠진다 — 남은 상한이 0 이므로
    // 「잴 수 없음」이 되어야 한다. 여기서 품질 1 을 내면 공허한 만점이다.
    expect(r.crossingMeasurable).toBe(false);
    expect(r.crossingQuality).toBeNull();
  });

  it("현선은 안 만나는데 곡선이 만나면 교차로 센다 — 화면을 재지 근사치를 재지 않는다", () => {
    // 두 엣지의 직선 현선은 서로 비껴간다. 컨트롤 포인트가 그리는 실제 곡선만
    // 교차한다 — 끝점만 잇는 계기는 이걸 통째로 놓친다.
    const straight = measureReadability({
      nodes: [node("a", 100, 100), node("b", 400, 100), node("c", 100, 160), node("d", 400, 160)],
      edges: [edge("a", "b", 100, 100, 400, 100), edge("c", "d", 100, 160, 400, 160)],
      ...VIEW,
    });
    expect(straight.crossings).toBe(0);

    const curved = measureReadability({
      nodes: [node("a", 100, 100), node("b", 400, 100), node("c", 100, 160), node("d", 400, 160)],
      edges: [
        edge("a", "b", 100, 100, 400, 100, [250, 400]), // 아래로 크게 휜다
        edge("c", "d", 100, 160, 400, 160, [250, -200]), // 위로 크게 휜다
      ],
      ...VIEW,
    });
    expect(curved.crossings).toBe(2 - 1); // 두 곡선이 두 번 만나도 «쌍» 은 1
  });

  it("화면 밖 기하는 세지 않는다 — 사용자가 못 보는 교차는 가독성 부담이 아니다", () => {
    const r = measureReadability({
      nodes: [],
      edges: [
        edge("a", "b", -900, -900, -700, -700),
        edge("c", "d", -700, -900, -900, -700), // 화면 밖에서 X 로 만난다
      ],
      ...VIEW,
    });
    expect(r.visibleEdges).toBe(0);
    expect(r.crossings).toBe(0);
  });
});

describe("노드 겹침 탐지", () => {
  it("포개진 두 노드를 1 쌍으로 센다 — 실측이 0 만 내던 그 칸의 프로브다", () => {
    const r = measureReadability({
      nodes: [node("a", 200, 200, 30), node("b", 210, 200, 30)],
      edges: [],
      ...VIEW,
    });
    expect(r.overlaps).toBe(1);
    expect(r.worstOverlapPx).toBe(50); // 반지름 합 60 − 거리 10
  });

  it("반지름 합보다 멀면 0 이다 — 스치는 것을 겹침이라 부르지 않는다", () => {
    const r = measureReadability({
      nodes: [node("a", 200, 200, 30), node("b", 261, 200, 30)],
      edges: [],
      ...VIEW,
    });
    expect(r.overlaps).toBe(0);
    expect(r.worstOverlapPx).toBe(0);
  });

  it("x 스윕 조기 종료가 뒤의 겹침을 잘라먹지 않는다 — 사이에 y 로만 먼 노드가 껴도", () => {
    // ★ 이 fixture 는 **판별하도록** 짜여 있다. 첫 판은 세로로 쌓은 세 노드였는데,
    //   스윕 축을 x→y 로 바꿔도 그대로 통과했다 — 즉 그 칸에 대해 게이트가 아니라
    //   장식이었다. 지금은 x 순서(a·b·c)와 y 거리가 어긋나게 배치했다: 축을 잘못
    //   쓰면 b 에서 조기 종료해 a-c 겹침을 통째로 놓친다.
    const r = measureReadability({
      nodes: [
        node("a", 200, 200, 30),
        node("b", 205, 500, 30), // x 로는 코앞, y 로는 반지름 합의 5배
        node("c", 210, 200, 30), // a 와 겹친다 — 축을 틀리면 여기 도달 전에 끊긴다
      ],
      edges: [],
      ...VIEW,
    });
    expect(r.overlaps).toBe(1);
    expect(r.worstOverlapPx).toBe(50); // 반지름 합 60 − 거리 10
  });
});

describe("계기가 스스로를 설명한다", () => {
  const SOURCE = readFileSync(join(process.cwd(), "scripts/lib/graph-readability.mjs"), "utf8");

  it("무엇을 일부러 안 재는지 근거와 함께 적어 둔다", () => {
    // 다음 사람이 «각도 해상도도 재자» 로 되돌아오는 것을 막는 것은 코드가
    // 아니라 이 문장이다 — 유의하지 않다고 밝혀진 축이라는 사실.
    expect(SOURCE).toContain("Purchase");
    expect(SOURCE).toContain("1997");
    expect(SOURCE).toMatch(/유의하지 않/);
  });
});
