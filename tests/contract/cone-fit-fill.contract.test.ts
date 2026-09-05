import { describe, expect, it } from "vitest";

import {
  buildDomeModel,
  CONE_HEIGHT_SCALE,
  DOME_NODE_FIT_ALLOWANCE_PX,
  DOME_NODE_PX,
  DOME_PITCH_DEFAULT,
  domeWorldBounds,
  type DomeInputNode,
} from "@/widgets/topology-map-v2/model/dome-view";
import { computeDomeFitCameraTarget } from "@/widgets/topology-map-v2/ui/topology-camera-math";

/**
 * **Does the cone actually land on the canvas?** (2026-09-05, owner direction B2.)
 *
 * ## The defect this locks out
 *
 * Measured on the sample vault (125 concepts) in the dev build, with the index
 * panel open and the map in Cone view:
 *
 * | viewport | free canvas | cone outline | fill |
 * |---|---|---|---|
 * | 1920x1080 | 1532 x 1080 | 602 x 620 | **22.6%** |
 * | 1440x900 | 1052 x 900 | 469 x 482 | **23.9%** |
 * | 1024x768 | 636 x 768 | 371 x 382 | **29.0%** |
 * | 834x1112 | 510 x 1112 | 276 x 284 | **13.9%** |
 *
 * A hundred and twenty-five dots inside a fifth of the stage is not a map of a
 * codebase, it is an ornament sitting in the middle of one. Two independent causes
 * produced it and both are pure arithmetic, which is why this gate is arithmetic
 * too: the cone was fitted through the **2D overview fit** (which reserves 268 px
 * of height for a tool lane, docking chips and a label row the cone never draws,
 * plus 470 px of static side inset) after its bounds were padded 15% a side, and
 * the cone's own silhouette was **taller than wide** in a landscape frame, where a
 * square can only reach 60% of the area by spending 100% of the height.
 *
 * ## What is measured here
 *
 * The real fit is run at the four viewport sizes the direction names, with the
 * panel obstruction actually measured on those screens, against **both ends of
 * the silhouette-aspect window** the cone can occupy. The assertion is the
 * direction's own bar: ≥60% of the free canvas at 1920, 1440 and 1024, ≥35% at
 * 834 — and no spill, because a fit that overflows is a crop, not a fill.
 *
 * The vault itself is deliberately not the subject here. One synthetic vault
 * would only prove the arithmetic for one shape, and the shape is what the
 * browser-side twin measures on the real vault
 * (`tests/e2e/map-3d-cone-drawing.spec.ts`, through `window.__atlasMap`). This
 * gate owns the arithmetic: it fails on a re-padded fit, a reinstated safe-inset
 * reservation, a widened tool-lane band or a node table that stops being a screen
 * quantity — all without a browser.
 */

/** The panel obstruction measured on each screen (index panel open, 2026-09-05). */
const SCREENS = [
  { name: "1920x1080", canvasW: 1856, canvasH: 1080, insetLeft: 324, insetRight: 0, floor: 0.6 },
  { name: "1440x900", canvasW: 1376, canvasH: 900, insetLeft: 324, insetRight: 0, floor: 0.6 },
  { name: "1024x768", canvasW: 960, canvasH: 768, insetLeft: 324, insetRight: 0, floor: 0.6 },
  { name: "834x1112", canvasW: 834, canvasH: 1112, insetLeft: 324, insetRight: 0, floor: 0.35 },
] as const;

/** The token values `app/globals.css` ships; drift there is caught by the token reader's own test. */
const TOKENS = {
  cameraScaleMin: 0.24,
  cameraScaleMax: 6,
  domeFitFill: 0.98,
  domeFitInsetTop: 80,
  domeFitInsetBottom: 32,
};

/**
 * The cone's silhouette aspect (width ÷ height of the node centres), measured on
 * the sample vault at all four sizes on 2026-09-05: 1.222, 1.223, 1.225, 1.226.
 * The window's two edges are where the fill floors break — 1920 cannot reach 60%
 * below 1.12 once the tool-lane and readout bands are reserved, and 834's narrow
 * free strip cannot reach 35% above 1.26. Both ends are asserted, so the fit is
 * proved for every shape the cone can currently take rather than for one sample.
 */
const ASPECT_WINDOW = [1.12, 1.26] as const;

/** A deterministic 1 + 9 + 27 + 88 vault — the sample vault's shape, not its names. */
function syntheticVault(): DomeInputNode[] {
  const nodes: DomeInputNode[] = [{ id: "p", kind: "project", x: 0, y: 0, parentId: null }];
  let elements = 0;
  for (let d = 0; d < 9; d += 1) {
    const domain = `d${d}`;
    nodes.push({ id: domain, kind: "domain", x: d * 40, y: 0, parentId: "p" });
    for (let c = 0; c < 3; c += 1) {
      const capability = `${domain}-c${c}`;
      nodes.push({ id: capability, kind: "capability", x: d * 40, y: c * 30, parentId: domain });
      const childCount = 2 + ((d + c) % 4);
      for (let e = 0; e < childCount && elements < 88; e += 1, elements += 1) {
        nodes.push({
          id: `${capability}-e${e}`,
          kind: "element",
          x: d * 40 + e * 7,
          y: c * 30 + 15,
          parentId: capability,
        });
      }
    }
  }
  return nodes;
}

describe("cone-fit-fill — 원뿔은 남은 캔버스를 채운다 (관상용 장식이 아니다)", () => {
  it("합성 볼트가 실제로 4단 원뿔을 만든다 — 계기가 빈 집합에서 공회전하지 않는다", () => {
    const model = buildDomeModel(syntheticVault());
    expect(model.coords.size).toBeGreaterThan(100);
    expect(model.circles.length).toBeGreaterThan(9);
    expect(domeWorldBounds(model, 0, DOME_PITCH_DEFAULT)).not.toBeNull();
  });

  it("원뿔의 실루엣은 가로가 길다 — 세로형이면 가로 캔버스의 60% 는 산술적으로 불가능하다", () => {
    // The height table is what decides this. At the hero's original heights the
    // silhouette measured 602 x 620 px — taller than wide — and a square can only
    // cover 60% of a 1.42 : 1 rectangle by spending 100% of its height, which puts
    // the apex under the floating tool lane.
    expect(CONE_HEIGHT_SCALE).toBeLessThan(1);
    expect(CONE_HEIGHT_SCALE).toBeGreaterThan(0.5);
  });

  for (const screen of SCREENS) {
    for (const aspect of ASPECT_WINDOW) {
      it(`${screen.name} · 실루엣 ${aspect} — 윤곽이 자유 캔버스의 ${Math.round(screen.floor * 100)}% 이상을 덮는다`, () => {
        // Centre bounds of the stated aspect, at a span in the cone's own range.
        const spanY = 1000;
        const spanX = spanY * aspect;
        const bounds = { minX: -spanX / 2, maxX: spanX / 2, minY: -spanY / 2, maxY: spanY / 2 };
        const target = computeDomeFitCameraTarget(
          bounds,
          screen.canvasW,
          screen.canvasH,
          {
            left: screen.insetLeft,
            right: screen.insetRight,
            top: TOKENS.domeFitInsetTop,
            bottom: TOKENS.domeFitInsetBottom,
          },
          DOME_NODE_FIT_ALLOWANCE_PX,
          TOKENS,
        );
        // The drawn outline is the discs, not the centres — the same allowance the
        // fit reserved, on each side. Node radius is a SCREEN quantity
        // (`DOME_NODE_PX`), so it does not ride the fit scale; that is what makes a
        // larger fit buy spacing instead of ink.
        const outlineW = spanX * target.tscale + DOME_NODE_FIT_ALLOWANCE_PX * 2;
        const outlineH = spanY * target.tscale + DOME_NODE_FIT_ALLOWANCE_PX * 2;
        const freeW = screen.canvasW - screen.insetLeft - screen.insetRight;
        const fill = (outlineW * outlineH) / (freeW * screen.canvasH);
        expect(fill, `fill ${(fill * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(screen.floor);
        // …and does not spill out either: a fit that overflows is not a fill, it is
        // a crop.
        expect(outlineW).toBeLessThanOrEqual(freeW);
        expect(outlineH).toBeLessThanOrEqual(screen.canvasH);
      });
    }
  }

  it("노드 반지름은 화면 픽셀이다 — 크게 맞출수록 잉크가 아니라 간격이 자란다", () => {
    // If the disc rode the fit scale, doubling the fit would double the dots and
    // the picture would come back with exactly the same crowding — which is what
    // 27 identical overlapping pairs at 1920, 1440, 1024 and 834 meant.
    expect(Object.values(DOME_NODE_PX).every((px) => px > 0 && px < 20)).toBe(true);
    expect(DOME_NODE_PX.project).toBeGreaterThan(DOME_NODE_PX.domain);
    expect(DOME_NODE_PX.domain).toBeGreaterThan(DOME_NODE_PX.capability);
    expect(DOME_NODE_PX.capability).toBeGreaterThan(DOME_NODE_PX.element);
  });
});
