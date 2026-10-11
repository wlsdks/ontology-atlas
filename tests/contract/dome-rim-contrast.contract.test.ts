
import { describe, expect, it } from "vitest";

import { domeFogAlpha, DOME_RIM_FOG_FLOOR } from "@/widgets/ontology-map/model/dome-view/ink";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * Depth fog may darken a node's rim only to 3:1: the stroke token composited over the canvas ground
 * at the rim's floored alpha, at every depth, must clear 3:1. Computed from shipped token values;
 * a pixel sample is not the gate because the adjacent background is often another node's edge.
 */

const CSS = readGlobalCss();

function token(name: string): string {
  // The first definition wins — the `:root` block, which is what the map reads.
  const match = CSS.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`${name} is not defined in app/globals.css`);
  return match[1];
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Source-over compositing of `ink` at `alpha` onto `ground` — what canvas does. */
function composite(
  ink: [number, number, number],
  ground: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [0, 1, 2].map((i) => ground[i] + alpha * (ink[i] - ground[i])) as [
    number,
    number,
    number,
  ];
}

/** The alpha the rim is painted at, at depth `u`. Mirrors `paint-nodes.ts`. */
function rimAlphaAt(u: number): number {
  const fog = domeFogAlpha(u);
  return Math.min(1, fog * Math.max(1, DOME_RIM_FOG_FLOOR / fog));
}

const GROUND = rgb(token("--map-canvas-bg-near"));
const STROKES: Record<string, [number, number, number]> = {
  project: rgb(token("--map-node-stroke-project")),
  domain: rgb(token("--map-ink-depth-top")),
  capability: rgb(token("--map-ink-depth-mid")),
  element: rgb(token("--map-ink-depth-leaf")),
};

describe("dome-rim-contrast — 안개는 테두리를 3:1 아래로 내리지 못한다", () => {
  it("평면 지도의 획 토큰 자체는 3:1 을 크게 넘는다 — 문제는 색이 아니라 알파였다", () => {
    for (const [kind, ink] of Object.entries(STROKES)) {
      expect(contrast(ink, GROUND), `${kind} at full alpha`).toBeGreaterThan(4.5);
    }
  });

  it("어느 깊이에서도 테두리 합성 대비가 3:1 이상이다", () => {
    for (let u = 0; u <= 1.0001; u += 0.01) {
      const alpha = rimAlphaAt(u);
      for (const [kind, ink] of Object.entries(STROKES)) {
        const ratio = contrast(composite(ink, GROUND, alpha), GROUND);
        expect(ratio, `${kind} at u=${u.toFixed(2)} (alpha ${alpha.toFixed(3)})`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("바닥값은 3:1 을 넘기는 가장 낮은 단계다 — 필요 이상으로 안개를 걷지 않는다", () => {
    // One 0.05 step lower must break the weakest stroke. Without this the floor
    // could be raised to 1.0 and the gate would still be green while depth fog
    // had quietly been switched off.
    const weakest = STROKES.element;
    const lower = DOME_RIM_FOG_FLOOR - 0.05;
    expect(contrast(composite(weakest, GROUND, lower), GROUND)).toBeLessThan(3);
  });

  it("안개 자체는 그대로다 — 채움은 여전히 0.09 까지 가라앉는다", () => {
    expect(domeFogAlpha(1)).toBeCloseTo(0.09, 6);
    expect(domeFogAlpha(0)).toBeCloseTo(1, 6);
  });
});
