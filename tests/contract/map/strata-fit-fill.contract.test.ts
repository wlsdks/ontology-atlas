
import { describe, expect, it } from "vitest";

import { CONE_HEIGHT_SCALE } from "@/widgets/ontology-map/model/dome-view/cone-layout";
import { DOME_NODE_PX } from "@/widgets/ontology-map/model/dome-view/ink";
import { buildDomeModel } from "@/widgets/ontology-map/model/dome-view/model-build";
import { DOME_PITCH_DEFAULT } from "@/widgets/ontology-map/model/dome-view/orbit";
import {
  DOME_NODE_FIT_ALLOWANCE_PX,
  domeWorldBounds,
} from "@/widgets/ontology-map/model/dome-view/projection";
import type { DomeInputNode } from "@/widgets/ontology-map/model/dome-view/types";
import { computeDomeFitCameraTarget } from "@/widgets/ontology-map/ui/camera/topology-camera-math";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * The real fit is run at four viewport sizes against the Strata silhouette the model builds, at every
 * yaw a turn passes through. No spill is allowed at any size, since an overflowing fit is a crop.
 */

const SCREENS = [
  { name: "1920x1080", canvasW: 1856, canvasH: 1080, insetLeft: 324, insetRight: 0, floor: 0.53 },
  { name: "1440x900", canvasW: 1376, canvasH: 900, insetLeft: 324, insetRight: 0, floor: 0.53 },
  { name: "1024x768", canvasW: 960, canvasH: 768, insetLeft: 324, insetRight: 0, floor: 0.6 },
  { name: "834x1112", canvasW: 834, canvasH: 1112, insetLeft: 324, insetRight: 0, floor: 0.35 },
] as const;

/**
 * The token values are **read from `app/globals.css`**, not copied here, so a retuned
 * band or a widened padding term recomputes the truth of that moment. Same discipline as
 * `accent-ink-contrast.contract.test.ts`.
 */
const CSS = readGlobalCss();

function cssNumber(name: string): number {
  // First definition wins — the `:root` block, which is what the workbench map reads.
  const match = CSS.match(new RegExp(`${name}:\\s*(-?[0-9.]+)\\s*;`));
  if (!match) throw new Error(`app/globals.css has no ${name}`);
  return Number(match[1]);
}

const TOKENS = {
  cameraScaleMin: cssNumber("--map-camera-scale-min"),
  cameraScaleMax: cssNumber("--map-camera-scale-max"),
  domeFitFill: cssNumber("--map-dome-fit-fill"),
  domeFitInsetTop: cssNumber("--map-dome-fit-inset-top"),
  domeFitInsetBottom: cssNumber("--map-dome-fit-inset-bottom"),
};

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

const MODEL = buildDomeModel(syntheticVault(), { arrangement: "strata" });

/** The silhouette aspect (width ÷ height of the node centres) at each yaw a turn passes. */
const ASPECTS = Array.from({ length: 12 }, (_, i) => {
  const b = domeWorldBounds(MODEL, (i / 12) * Math.PI * 2, DOME_PITCH_DEFAULT)!;
  return (b.maxX - b.minX) / (b.maxY - b.minY);
});
/** Both ends of that range, widened by 3% so a small layout change does not slip past. */
const ASPECT_WINDOW = [Math.min(...ASPECTS) * 0.97, Math.max(...ASPECTS) * 1.03] as const;

describe("strata-fit-fill — the lit planes fill the free canvas (not an ornament)", () => {
  it("the synthetic vault really builds four Strata planes and a sector per domain — the instrument is not idling", () => {
    expect(MODEL.coords.size).toBeGreaterThan(100);
    expect(MODEL.circles.filter((c) => c.named).length).toBe(4);
    expect(MODEL.sectors.filter((s) => s.kind === "domain")).toHaveLength(9);
    expect(domeWorldBounds(MODEL, 0, DOME_PITCH_DEFAULT)).not.toBeNull();
  });

  it("the silhouette is wider than tall — a tall one cannot fill a landscape canvas", () => {
    // The plane height table decides this; it is shared with the Cone's seed layout.
    expect(CONE_HEIGHT_SCALE).toBeLessThan(1);
    expect(CONE_HEIGHT_SCALE).toBeGreaterThan(0.5);
    expect(Math.min(...ASPECTS)).toBeGreaterThan(1);
  });

  for (const screen of SCREENS) {
    for (const aspect of ASPECT_WINDOW) {
      it(`${screen.name} · silhouette ${aspect.toFixed(3)} — the outline covers at least ${Math.round(screen.floor * 100)}% of the free canvas`, () => {
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
        // The drawn outline is the discs, not the centres — the same allowance the fit
        // reserved, on each side. Node radius is a SCREEN quantity (`DOME_NODE_PX`).
        const outlineW = spanX * target.tscale + DOME_NODE_FIT_ALLOWANCE_PX * 2;
        const outlineH = spanY * target.tscale + DOME_NODE_FIT_ALLOWANCE_PX * 2;
        const freeW = screen.canvasW - screen.insetLeft - screen.insetRight;
        const fill = (outlineW * outlineH) / (freeW * screen.canvasH);
        expect(fill, `fill ${(fill * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(screen.floor);
        expect(outlineW).toBeLessThanOrEqual(freeW);
        expect(outlineH).toBeLessThanOrEqual(screen.canvasH);
      });
    }
  }

  it("node radius is a screen quantity — a larger fit grows spacing, not ink", () => {
    expect(Object.values(DOME_NODE_PX).every((px) => px > 0 && px < 20)).toBe(true);
    expect(DOME_NODE_PX.project).toBeGreaterThan(DOME_NODE_PX.domain);
    expect(DOME_NODE_PX.domain).toBeGreaterThan(DOME_NODE_PX.capability);
    expect(DOME_NODE_PX.capability).toBeGreaterThan(DOME_NODE_PX.element);
  });
});
