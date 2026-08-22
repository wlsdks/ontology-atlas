import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { measureReadability } from "../../scripts/lib/graph-readability.mjs";

/**
 * **Probes** for the graph readability instrument.
 *
 * **Why this file ships in the same PR as the instrument.** `/gate-probe`: **a gate
 * that only ever passes is indistinguishable from no gate.** This instrument's first
 * measurement stood exactly there — all three cases returned 0 overlaps, and browser
 * measurement alone can never tell whether that 0 means "the map does not overlap"
 * or "the detector is idle", because you cannot feed it a known answer.
 *
 * So the computation was split out into a pure function outside the page, and
 * **known answers** are fed in here. Each `it` says "in this situation the number
 * must be exactly this" — if any one of them returns 0, that detector is dead.
 *
 * Evidence: Purchase, *"Which Aesthetic has the Greatest Effect on Human
 * Understanding?"*, Graph Drawing 1997 — minimising edge crossings mattered
 * overwhelmingly most for human comprehension, while angular resolution and grid
 * snapping were not significant. So this instrument measures only crossings and
 * overlaps, and these probes prove only those two.
 */

const VIEW = { width: 1000, height: 1000 };
const node = (id: string, x: number, y: number, radius = 10) => ({ id, x, y, radius });
/** An edge with no control point is treated as a straight line — the probes use that path. */
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
    expect(r.crossingQuality).toBe(0); // 1 of 1 possible crossing actually occurred
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
    // Counting them would make any graph with a high-degree node score badly
    // regardless of its layout.
    const r = measureReadability({
      nodes: [node("hub", 200, 200), node("a", 100, 100), node("b", 300, 100)],
      edges: [edge("hub", "a", 200, 200, 100, 100), edge("hub", "b", 200, 200, 300, 100)],
      ...VIEW,
    });
    expect(r.crossings).toBe(0);
    // And that pair also drops out of the **possible crossings** — with the remaining
    // ceiling at 0 the result must be "not measurable". Returning quality 1 here would
    // be a hollow perfect score.
    expect(r.crossingMeasurable).toBe(false);
    expect(r.crossingQuality).toBeNull();
  });

  it("현선은 안 만나는데 곡선이 만나면 교차로 센다 — 화면을 재지 근사치를 재지 않는다", () => {
    // The straight chords of the two edges miss each other; only the actual curves the
    // control points draw intersect — an instrument that joins endpoints only misses
    // this entirely.
    const straight = measureReadability({
      nodes: [node("a", 100, 100), node("b", 400, 100), node("c", 100, 160), node("d", 400, 160)],
      edges: [edge("a", "b", 100, 100, 400, 100), edge("c", "d", 100, 160, 400, 160)],
      ...VIEW,
    });
    expect(straight.crossings).toBe(0);

    const curved = measureReadability({
      nodes: [node("a", 100, 100), node("b", 400, 100), node("c", 100, 160), node("d", 400, 160)],
      edges: [
        edge("a", "b", 100, 100, 400, 100, [250, 400]), // bows far downward
        edge("c", "d", 100, 160, 400, 160, [250, -200]), // bows far upward
      ],
      ...VIEW,
    });
    expect(curved.crossings).toBe(2 - 1); // two curves meeting twice is still one pair
  });

  it("화면 밖 기하는 세지 않는다 — 사용자가 못 보는 교차는 가독성 부담이 아니다", () => {
    const r = measureReadability({
      nodes: [],
      edges: [
        edge("a", "b", -900, -900, -700, -700),
        edge("c", "d", -700, -900, -900, -700), // they cross in an X off screen
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
    expect(r.worstOverlapPx).toBe(50); // radius sum 60 − distance 10
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
    // This fixture is built to **discriminate**. The first version stacked three nodes
    // vertically and still passed when the sweep axis was changed from x to y — for
    // that cell it was decoration, not a gate. Now the x order (a·b·c) and the y
    // distances are deliberately misaligned: with the wrong axis the sweep terminates
    // early at b and misses the a-c overlap entirely.
    const r = measureReadability({
      nodes: [
        node("a", 200, 200, 30),
        node("b", 205, 500, 30), // adjacent in x, five times the radius sum away in y
        node("c", 210, 200, 30), // overlaps a — with the wrong axis the sweep stops before reaching it
      ],
      edges: [],
      ...VIEW,
    });
    expect(r.overlaps).toBe(1);
    expect(r.worstOverlapPx).toBe(50); // radius sum 60 − distance 10
  });
});

describe("계기가 스스로를 설명한다", () => {
  const SOURCE = readFileSync(join(process.cwd(), "scripts/lib/graph-readability.mjs"), "utf8");

  it("무엇을 일부러 안 재는지 근거와 함께 적어 둔다", () => {
    // What stops the next person returning with "let us measure angular resolution
    // too" is not code but this sentence — the fact that it was found not to be
    // significant.
    expect(SOURCE).toContain("Purchase");
    expect(SOURCE).toContain("1997");
  });
});
