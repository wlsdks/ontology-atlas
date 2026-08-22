import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract for the map inspection hook (`window.__atlasMap`).
 *
 * **Why a contract test.** This hook is **the only window automation has for
 * telling the map apart from outside**. If it quietly disappears, or if its gate
 * comes off, each fails badly in its own way:
 *
 * - Window gone → the harness does not die with "node not found"; it **falls back
 *   to the old method (cursor sweeping), pushes the background, and reports "it
 *   isn't slow here".** That wrong answer was given six times on 2026-07-31.
 * - Gate (the `e2e` query) gone → the diagnostic window is attached **for every
 *   user**.
 *
 * Lint cannot catch either: this is not a value rule but "does this code exist and
 * is it conditional".
 */
const LOOP = join(
  process.cwd(),
  "src/widgets/topology-map-v2/ui/use-topology-loop.ts",
);

const source = readFileSync(LOOP, "utf8");

describe("지도 검사 훅 (window.__atlasMap)", () => {
  it("`e2e` 쿼리가 있을 때만 붙는다 — 상시 노출이 아니다", () => {
    expect(source).toContain("__atlasMap");
    // The gate must have this shape. Delete the condition and the diagnostic window becomes product surface.
    expect(source).toMatch(/URLSearchParams\(window\.location\.search\)\.has\("e2e"\)/);
  });

  it("창구를 걷어낸다 — 언마운트 뒤 전역에 남지 않는다", () => {
    expect(source).toMatch(/delete \(window as unknown as \{ __atlasMap\?: typeof hook \}\)\.__atlasMap/);
  });

  /**
   * This list is the reach of what can be distinguished from outside. Each missing
   * entry is a blind spot for automated checking, and in that blind spot a person has
   * to look at the screen instead.
   */
  const REQUIRED_ACCESSORS = [
    "nodes:", // What is where, and what can be dragged
    "edges:", // Where the lines run — the only input for whether the map reads *as a graph*
    "interaction:", // Is the current drag a node or the background — the core of the incident
    "backing:", // Is the resolution cap actually applied
    "camera:", // Where the map is looking
    "selection:", // What is selected
    "chips:", // Does a chip's claim match reality
  ] as const;

  it.each(REQUIRED_ACCESSORS)("`%s` 창구가 있다", (accessor) => {
    expect(source).toContain(accessor);
  });

  it("엣지는 컨트롤 포인트까지 낸다 — 현선을 재면 화면에 없는 교차를 센다", () => {
    // The draw path is `quadraticCurveTo`. Exposing only the endpoints makes the
    // readability instrument measure its own approximation rather than the map, and
    // that error is silent (a number still comes out). Since the 3D view
    // (2026-08-18) the control point also takes the same endpoint-offset average as
    // draw (`projectEdgePoints`) — with 3D off the offset is 0 and behaviour is
    // unchanged.
    expect(source).toContain("controlX: toScreenX(e.controlX + (offA.dx + offB.dx) / 2)");
    expect(source).toContain("controlY: toScreenY(e.controlY + (offA.dy + offB.dy) / 2)");
  });

  it("노드는 화면 반지름을 낸다 — 겹침은 반지름 없이 셀 수 없다", () => {
    // Must be **the same expression** as the drawing side: radiusForKind ×
    // magnitudeScale × camera zoom (× the 3D frame's perspective factor s — identical
    // to draw; 1 in 2D).
    expect(source).toMatch(
      /radius:\s*tokens\s*\n?\s*\?\s*radiusForKind\(n\.kind, tokens\) \*\s*\n?\s*n\.magnitudeScale \*\s*\n?\s*camera\.scale\.value \*\s*\n?\s*dOff\.s/,
    );
  });

  it("`draggable` 을 노출한다 — 호버 히트와 «잡히는지» 는 다르다", () => {
    // A pointer cursor still fails to grab if the node is absent from the
    // simulation, and it silently becomes a pan. Without this field the harness
    // cannot see that difference — which is exactly the incident.
    expect(source).toMatch(/draggable:\s*sim\?\.hasNode/);
  });

  it("칩은 주장과 실제를 나란히 낸다", () => {
    // With `claimedCount` but no `shownChildren`, the mismatch of "says +24 and draws
    // 1" is invisible from outside — a defect that actually occurred.
    expect(source).toContain("claimedCount");
    expect(source).toContain("shownChildren");
  });
});
