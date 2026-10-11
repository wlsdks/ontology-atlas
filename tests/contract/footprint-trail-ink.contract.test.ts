import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FOOTPRINT_RANGES,
} from "@/shared/lib/preferences/appearance-preferences";
import { trailNodeInkStrength } from "@/widgets/ontology-map/model/focus-state";
import { draw as traceDraw } from "@/widgets/ontology-map/render/traces";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/** Both selectable footprint trail inks must stay readable; contrast is accessibility, not taste. */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** WCAG relative luminance → contrast ratio. The non-text floor is 3:1 (WCAG 1.4.11). */
function contrastRatio(a: readonly number[], b: readonly number[]): number {
  const lum = (rgb: readonly number[]): number => {
    const f = (v: number): number => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("걸어온 길 잉크 — 고를 수 있는 세 톤은 모두 읽힌다", () => {
  /**
   * The footprint must be readable in every combination the user can choose: each tone at the lowest
   * intensity clears 3:1 against the canvas (WCAG 1.4.11 non-text contrast). A selectable invisible
   * trail is a defect, not a setting.
   */
  it("세 톤 모두 최저 진하기에서 3:1 을 넘는다", () => {
    const css = readGlobalCss();
    const bg = hexRgb(/--map-canvas-bg-near:\s*(#[0-9a-fA-F]{6})/.exec(css)![1]);
    const tones = {
      amber: /--color-footprint-trail:\s*(#[0-9a-fA-F]{6})/.exec(css)![1],
      indigo: /--color-footprint-trail-indigo:\s*(#[0-9a-fA-F]{6})/.exec(css)![1],
      // A third choice is a third way to pick an invisible trail, so it is held to the same floor.
      star: /--color-footprint-trail-star:\s*(#[0-9a-fA-F]{6})/.exec(css)![1],
    };
    for (const [name, hexValue] of Object.entries(tones)) {
      const over = hexRgb(hexValue).map((c, i) => c * FOOTPRINT_RANGES.opacity.min + bg[i] * (1 - FOOTPRINT_RANGES.opacity.min));
      const contrast = contrastRatio(over as [number, number, number], bg);
      expect(contrast, `${name} 톤이 최저 진하기에서 ${contrast.toFixed(2)}:1 — 안 보이는 발자국을 고를 수 있다`).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * Footprint yellow does **not share bits** with hub amber. If they matched, "this
   * is the centre" and "you walked here" would be one colour and the distinction the
   * colour carried would disappear.
   */
  it("발자국 노랑은 허브 앰버와 다른 값이다", () => {
    const css = readGlobalCss();
    const hub = /--map-amber-hub:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase();
    const trail = /--color-footprint-trail:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase();
    expect(hub).toBeDefined();
    expect(trail).toBeDefined();
    expect(trail).not.toBe(hub);
  });
});

/**
 * The path-walked lens tints nodes and relation lines with the trail ink: the same ink (no new hue),
 * lens-scoped (ramp 0 gives ink 0, so never permanent amber), and a contrast change, not bloom.
 */
describe("걸어온 길 렌즈 — 노드와 선의 트레일 잉크", () => {
  it("렌즈가 꺼져 있으면(램프 0) 아무 노드도 트레일 잉크를 안 받는다", () => {
    expect(trailNodeInkStrength({ kept: true, ramp: 0, colorEgoState: "normal" })).toBe(0);
  });

  it("방문한 노드만 받는다", () => {
    expect(trailNodeInkStrength({ kept: true, ramp: 1, colorEgoState: "normal" })).toBe(1);
    expect(trailNodeInkStrength({ kept: false, ramp: 1, colorEgoState: "dim" })).toBe(0);
  });

  /** Selection ring (indigo) > footprint — "here now" and "been here" must not be one colour. */
  it("고른 노드는 트레일 잉크를 받지 않는다", () => {
    expect(trailNodeInkStrength({ kept: true, ramp: 1, colorEgoState: "center" })).toBe(0);
  });

  /** Mid-ramp values pass through — this fades out, it does not hard-cut. */
  it("램프 중간값이 그대로 세기가 된다", () => {
    expect(trailNodeInkStrength({ kept: true, ramp: 0.4, colorEgoState: "normal" })).toBeCloseTo(0.4, 6);
    expect(trailNodeInkStrength({ kept: true, ramp: 3, colorEgoState: "normal" })).toBe(1);
    expect(trailNodeInkStrength({ kept: true, ramp: Number.NaN, colorEgoState: "normal" })).toBe(0);
  });

  /**
   * A walked relation line is not background ink while the lens is on: the lens dims every edge, so the
   * colour actually painted is recorded and measured.
   */
  it("밟은 선은 dim 이 아니라 트레일 색으로 칠해진다", () => {
    const tokens = {
      edgeContains: "#3a3a44",
      edgeDepends: "#4a4a58",
      edgeDim: "#232329",
      indigo: "#5e6ad2",
      indigoBright: "#787ef6",
      edgeTrail: "#e8c47a",
    };
    const base = {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      control: { x: 50, y: 10 },
      relationType: "contains" as const,
      egoState: "dim" as const,
      farT: 0,
      t: 0,
      reducedMotion: true,
    };
    const strokeOf = (over: Partial<typeof base> & { trailWalked?: number }): string => {
      const seen: string[] = [];
      const ctx = {
        set strokeStyle(v: string) { seen.push(v); },
        get strokeStyle() { return seen[seen.length - 1] ?? ""; },
        globalAlpha: 1, fillStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
        save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
        quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {}, setLineDash() {},
      } as unknown as CanvasRenderingContext2D;
      traceDraw(ctx, { ...base, ...over }, tokens);
      return seen[0] ?? "";
    };
    // Lens off — dim, as before.
    expect(strokeOf({ trailWalked: 0 })).toBe(tokens.edgeDim);
    // Lens on — trail ink.
    expect(strokeOf({ trailWalked: 1 }), "밟은 선이 여전히 배경 잉크다").toBe("rgb(232, 196, 122)");
    // Mid-ramp — somewhere between dim and trail (not a hard cut).
    const mid = strokeOf({ trailWalked: 0.5 });
    expect(mid).not.toBe(tokens.edgeDim);
    expect(mid).not.toBe("rgb(232, 196, 122)");
  });

  /**
   * Unwalked lines recede as before: the lens exists to clear the field around the trail, and
   * keeping them lit would make it do nothing.
   */
  it("렌즈가 켜져도 안 밟은 선은 dim 그대로다", () => {
    const source = readFileSync(
      join(repoRoot, "src/widgets/ontology-map/ui/frame-draw/paint-edges.ts"),
      "utf8",
    );
    expect(source).toContain("walkedEdgeKeys");
    expect(source).toContain("trailWalked: walkedTrail");
  });
});

describe("별빛 톤은 지도가 이미 쓰는 별 잉크와 같은 값이다", () => {
  /*
   * ⚠️ The point of the star tone is that it is **not a new hue**. `render/starfield.ts`
   * paints the far-field dust and the diffraction spikes at this value already, under a
   * header naming the language ("B1 constellation DNA"). If the two drift apart, the map
   * ends up with two whites that mean nearly the same thing, which is the drift the whole
   * change exists to end.
   */
  /*
   * Strips comments and asserts every painted literal, not the existence of one: `starfield.ts` names
   * its own literal in a comment, which would satisfy a whole-file search. A length floor catches
   * deleted literals.
   */
  it("starfield 이 칠하는 모든 값과 어긋나지 않는다", () => {
    const css = readGlobalCss();
    const trail = /--color-footprint-trail-star:\s*(#[0-9a-fA-F]{6})/.exec(css)![1].toLowerCase();
    const rgb = hexRgb(trail);
    const code = read("src/widgets/ontology-map/render/starfield.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const painted = [...code.matchAll(/rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,/g)];
    expect(painted.length, "starfield 이 아무 색도 칠하지 않는다 — 게이트가 죽었다").toBeGreaterThan(0);
    for (const m of painted) {
      expect(
        [Number(m[1]), Number(m[2]), Number(m[3])],
        `별빛 톤 ${trail} 이 starfield 가 칠하는 rgba(${m[1]},${m[2]},${m[3]}) 와 다르다 — 흰색이 두 개가 된다`,
      ).toEqual(rgb);
    }
  });
});
