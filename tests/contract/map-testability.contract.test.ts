import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `window.__atlasMap` is the only way automation can tell the map apart from outside. If it vanishes
 * the harness falls back to cursor sweeping, and if its `e2e` gate goes it attaches for every user.
 */
const INSTRUMENTATION = join(
  process.cwd(),
  "src/widgets/ontology-map/ui/loop/use-topology-map-instrumentation.ts",
);

const source = readFileSync(INSTRUMENTATION, "utf8");
const loop = readFileSync(join(process.cwd(), "src/widgets/ontology-map/ui/loop/use-topology-loop.ts"), "utf8");

describe("지도 검사 훅 (window.__atlasMap)", () => {
  it("the production loop installs the inspection hook", () => {
    expect(loop).toMatch(/import\s*\{\s*useTopologyMapInstrumentation\s*\}\s*from\s*["']\.\/use-topology-map-instrumentation["']/);
    expect(loop).toMatch(/\buseTopologyMapInstrumentation\(\{/);
  });

  it("`e2e` 쿼리가 있을 때만 붙는다 — 상시 노출이 아니다", () => {
    expect(source).toContain("__atlasMap");
    // The gate must have this shape. Delete the condition and the diagnostic window becomes product surface.
    expect(source).toMatch(/URLSearchParams\(window\.location\.search\)\.has\("e2e"\)/);
  });

  it("창구를 걷어낸다 — 언마운트 뒤 전역에 남지 않는다", () => {
    expect(source).toMatch(/delete\s+\(window as unknown as \{\s*__atlasMap\?: typeof hook;?\s*\}\)\.__atlasMap/);
  });

  /**
   * This list is the reach of what can be distinguished from outside. Each missing
   * entry is a blind spot for automated checking, and in that blind spot a person has
   * to look at the screen instead.
   */
  const REQUIRED_ACCESSORS = [
    "nodes:", // What is where, and what can be dragged
    "edges:", // Where the lines run — the only input for whether the map reads *as a graph*
    "interaction:", // Whether the current drag is a node or the background
    "backing:", // Is the resolution cap actually applied
    "camera:", // Where the map is looking
    "selection:", // What is selected
    "chips:", // Does a chip's claim match reality
  ] as const;

  it.each(REQUIRED_ACCESSORS)("`%s` 창구가 있다", (accessor) => {
    expect(source).toMatch(new RegExp(`\\b${accessor}\\s*\\(\\)\\s*=>`));
  });

  it("엣지는 컨트롤 포인트까지 낸다 — 현선을 재면 화면에 없는 교차를 센다", () => {
    // Keep the public coordinate fields. Accuracy is checked against actual
    // canvas stroke commands in map-3d-edge-picking.spec.ts; pinning the old
    // endpoint-offset formula here had preserved a different curve than paint.
    expect(source).toMatch(/controlX:\s*toScreenX\(/);
    expect(source).toMatch(/controlY:\s*toScreenY\(/);
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
    // A pointer cursor still fails to grab a node that is absent from the simulation; it becomes a pan.
    // Without this field the harness cannot see the difference.
    expect(source).toMatch(/draggable:\s*sim\?\.hasNode/);
  });

  it("칩은 주장과 실제를 나란히 낸다", () => {
    // With `claimedCount` but no `shownChildren`, the mismatch of "says +24 and draws
    // 1" is invisible from outside — a defect that actually occurred.
    expect(source).toMatch(/\bclaimedCount:\s*chip\.count/);
    expect(source).toMatch(/\bshownChildren:\s*shown/);
  });
});
