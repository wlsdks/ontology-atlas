import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **The overview keeps equal air on both sides of the drawing** (2026-09-25).
 *
 * The side lanes of the map's safe area (`--map-safe-inset-left/right`) are what the
 * overview fit reserves beside the drawing, and the fit centres the drawing between
 * them. They are unitless numbers because canvas 2D reads them, so they cannot follow
 * the chrome they stand for by themselves — and they had drifted apart: the open INDEX
 * reserved 26 px past its edge while the utility rail reserved 52 px past its own, so
 * even a correctly bounded drawing sat 13 px left of the free map's centre at 1512
 * wide (measured on the installed app's window, 1512×949).
 *
 * Each lane is the footprint of the chrome standing on that side plus one air, and the
 * air is the same everywhere. The footprints are read from the tokens and the classes
 * that actually place the chrome, so moving the rail or widening INDEX turns this red
 * instead of shifting the map quietly. The rendered result is measured by
 * `tests/e2e/map-overview-centre.spec.ts`.
 */

const css = readFileSync("app/globals.css", "utf8");
const fit = readFileSync("src/widgets/topology-controls/ui/TopologyFitControl.tsx", "utf8");
const canvas = readFileSync("src/views/home/ui/TopologyCanvasSurface.tsx", "utf8");
const chrome = readFileSync("src/views/home/ui/TopologyCommandChrome.tsx", "utf8");

function px(name: string): number {
  const match = css.match(new RegExp(`${name}:\\s*([\\d.]+)px;`));
  expect(match, `${name} is not a px token in app/globals.css`).not.toBeNull();
  return Number(match![1]);
}

/** The value a block gives a lane, found by the selector that opens the block. */
function lane(blockOpening: RegExp, name: "left" | "right"): number {
  const block = css.match(blockOpening);
  expect(block, `no block ${blockOpening} in app/globals.css`).not.toBeNull();
  const value = block![0].match(new RegExp(`--map-safe-inset-${name}:\\s*(\\d+);`));
  expect(value, `${blockOpening} sets no --map-safe-inset-${name}`).not.toBeNull();
  return Number(value![1]);
}

/** The resting lanes: the §2.5 block, where left, right and top stand together. */
const REST_BLOCK = /--map-safe-inset-left:\s*\d+;\s*--map-safe-inset-right:\s*\d+;\s*--map-safe-inset-top/;

describe("the map's side lanes are footprint plus one equal air", () => {
  it("INDEX stands on the chrome inset, and its collapsed tab on the map's edge", () => {
    expect(css).toMatch(/--topology-index-inset:\s*var\(--chrome-inset\);/);
    const slot = readFileSync("src/views/home/ui/TopologyIndexSlot.tsx", "utf8");
    expect(slot).toMatch(/left: frame\.state === "expanded" \? "var\(--topology-index-inset\)" : 0/);
  });

  it("the utility rail stands one chrome inset from the map's right edge, half an inset beside the dock", () => {
    // Four tiles: fit (its own file) and the tour, shortcuts and growth-replay tiles.
    expect(fit).toContain("md:right-[var(--chrome-inset)]");
    expect(canvas.match(/md:right-\[var\(--chrome-inset\)\]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    for (const source of [fit, canvas, chrome]) expect(source).not.toMatch(/xl:(right|top)-8/);
    expect(css).toMatch(/\[data-agent-panel-open='true'\] \[data-agent-dock-adjacent-rail='true'\] \{\s*right: calc\(var\(--chrome-inset\) \/ 2\);/);
  });

  it("reserves the same air past INDEX, its tab, the rail, and the rail beside the dock", () => {
    const chromeInset = px("--chrome-inset");
    const tile = px("--chrome-tile-size");
    const indexWidth = px("--topology-index-width");
    const tabWidth = px("--topology-index-tab-width");
    const restLeft = lane(REST_BLOCK, "left");
    const restRight = lane(REST_BLOCK, "right");
    const collapsedLeft = lane(/html\[data-topology-index="collapsed"\]\s*\{[^}]*\}/, "left");
    const dockRight = lane(/:root:has\(main\[data-agent-panel-open="true"\]\)\s*\{[^}]*\}/, "right");
    const air = {
      index: restLeft - (chromeInset + indexWidth),
      tab: collapsedLeft - tabWidth,
      rail: restRight - (chromeInset + tile),
      railBesideDock: dockRight - (chromeInset / 2 + tile),
    };
    expect(air.index, "no air past the open INDEX").toBeGreaterThan(0);
    expect(air).toEqual({ index: air.index, tab: air.index, rail: air.index, railBesideDock: air.index });
  });
});
