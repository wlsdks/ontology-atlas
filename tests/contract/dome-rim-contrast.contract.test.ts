import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  domeFogAlpha,
  DOME_RIM_FOG_FLOOR,
} from "@/widgets/topology-map-v2/model/dome-view";

/**
 * **Depth fog may darken a node's rim only to 3 : 1** (2026-09-05, owner
 * direction B2).
 *
 * ## What was measured
 *
 * `domeFogAlpha` runs from 1.0 at the front to **0.09** at the back and
 * multiplies the whole node — the fill, the shading, and the rim. On the sample
 * vault at 1920 that left the median node rim at **1.15 : 1** against the pixels
 * beside it, with 117 of 125 nodes under 3 : 1 and 92 under 1.5 : 1: a hundred
 * shapes whose edge you cannot see. The flat map holds its own painted nodes to
 * the 3 : 1 ink floor, and the same four stroke tokens are what the cone paints
 * with — only the alpha differed.
 *
 * ## What this locks
 *
 * The composite the draw actually commits: `stroke token` laid over the canvas
 * ground at the rim's floored alpha, at **every depth**, must clear 3 : 1. The
 * arithmetic is done here from the shipped token values rather than from a
 * remembered number, so a darker ground, a dimmer stroke token or a lowered
 * floor all fail in the same place.
 *
 * The fog itself is untouched: the fill still sinks to 0.09, and the halo, the
 * line-width attenuation, the perspective size and the painter's-algorithm draw
 * order all still carry depth. Only the edge has a floor.
 *
 * A pixel measurement is deliberately *not* the gate. In a cone of 125 nodes the
 * "adjacent background" is often another node's containment edge or its own base
 * ring rather than the ground, so a screen sample measures the crowd as much as
 * the rim; `tests/e2e/map-3d-cone-drawing.spec.ts` records that number as an
 * observation, and this file owns the floor.
 */

const CSS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

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

/** The alpha the rim is painted at, at depth `u`. Mirrors `topology-frame-draw.ts`. */
function rimAlphaAt(u: number): number {
  const fog = domeFogAlpha(u);
  return Math.min(1, fog * Math.max(1, DOME_RIM_FOG_FLOOR / fog));
}

const GROUND = rgb(token("--topology-v2-canvas-bg-near"));
const STROKES: Record<string, [number, number, number]> = {
  project: rgb(token("--topology-v2-node-stroke-project")),
  domain: rgb(token("--topology-v2-ink-depth-top")),
  capability: rgb(token("--topology-v2-ink-depth-mid")),
  element: rgb(token("--topology-v2-ink-depth-leaf")),
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
