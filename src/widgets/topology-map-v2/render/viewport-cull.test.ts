import { describe, expect, it } from "vitest";

import { isEdgeCulled, isNodeCulled, isPassthroughEdge } from "./viewport-cull";

const W = 1200;
const H = 800;

describe("isNodeCulled", () => {
  it("keeps a node inside the viewport", () => {
    expect(isNodeCulled({ x: 600, y: 400 }, 20, W, H)).toBe(false);
  });

  it("keeps a node whose centre is outside but whose disc still overlaps", () => {
    expect(isNodeCulled({ x: -10, y: 400 }, 20, W, H)).toBe(false);
    expect(isNodeCulled({ x: W + 10, y: 400 }, 20, W, H)).toBe(false);
    expect(isNodeCulled({ x: 600, y: -10 }, 20, W, H)).toBe(false);
    expect(isNodeCulled({ x: 600, y: H + 10 }, 20, W, H)).toBe(false);
  });

  it("culls a node fully past each edge", () => {
    expect(isNodeCulled({ x: -40, y: 400 }, 20, W, H)).toBe(true);
    expect(isNodeCulled({ x: W + 40, y: 400 }, 20, W, H)).toBe(true);
    expect(isNodeCulled({ x: 600, y: -40 }, 20, W, H)).toBe(true);
    expect(isNodeCulled({ x: 600, y: H + 40 }, 20, W, H)).toBe(true);
  });

  it("respects the screen radius — a big node stays when a small one at the same point goes", () => {
    const far = { x: -100, y: 400 };
    expect(isNodeCulled(far, 10, W, H)).toBe(true);
    expect(isNodeCulled(far, 150, W, H)).toBe(false);
  });
});

describe("isEdgeCulled", () => {
  const inside = { x: 600, y: 400 };

  it("keeps an edge with any part on screen", () => {
    expect(isEdgeCulled(inside, { x: 900, y: 500 }, { x: 750, y: 300 }, 0, W, H)).toBe(false);
  });

  /**
   * The regression this module exists to avoid: Guardian's proposed
   * "both endpoints off-screen → cull" rule would drop this edge, but it
   * visibly crosses the whole viewport.
   */
  it("keeps a long edge that crosses the viewport with BOTH endpoints outside", () => {
    const a = { x: -400, y: 400 };
    const b = { x: W + 400, y: 400 };
    expect(isEdgeCulled(a, b, { x: 600, y: 400 }, 0, W, H)).toBe(false);
  });

  it("culls an edge whose whole control hull sits past one side", () => {
    expect(isEdgeCulled({ x: -300, y: 400 }, { x: -200, y: 500 }, { x: -250, y: 450 }, 0, W, H)).toBe(true);
    expect(isEdgeCulled({ x: 600, y: H + 200 }, { x: 700, y: H + 300 }, { x: 650, y: H + 250 }, 0, W, H)).toBe(true);
  });

  it("keeps an edge held on screen only by its bow control point", () => {
    const a = { x: -200, y: -200 };
    const b = { x: -100, y: -100 };
    expect(isEdgeCulled(a, b, { x: 600, y: 400 }, 0, W, H)).toBe(false);
  });

  it("margin widens the keep-zone rather than narrowing it", () => {
    const a = { x: -120, y: 400 };
    const b = { x: -110, y: 420 };
    const c = { x: -115, y: 410 };
    expect(isEdgeCulled(a, b, c, 0, W, H)).toBe(true);
    expect(isEdgeCulled(a, b, c, 200, W, H)).toBe(false);
  });
});

/** True only for edges that cross the viewport with neither endpoint visible. */
describe("isPassthroughEdge", () => {
  it("両끝점 화면 밖 + 곡선 관통 = 강등 대상", () => {
    expect(isPassthroughEdge({ x: -400, y: 400 }, { x: W + 400, y: 400 }, 24, W, H)).toBe(true);
  });
  it("끝점 하나라도 보이면 강등하지 않는다", () => {
    expect(isPassthroughEdge({ x: 600, y: 400 }, { x: W + 400, y: 400 }, 24, W, H)).toBe(false);
  });
});
