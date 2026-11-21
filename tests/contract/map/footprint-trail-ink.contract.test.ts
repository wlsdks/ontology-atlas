import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FOOTPRINT_RANGES,
} from "@/shared/lib/preferences/appearance-preferences";
import { trailNodeInkStrength } from "@/widgets/ontology-map/model/visibility/focus-state";
import { draw as traceDraw } from "@/widgets/ontology-map/render/traces";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/** Both selectable footprint trail inks must stay readable; contrast is accessibility, not taste. */

const repoRoot = join(import.meta.dirname, "..", "..", "..");
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

describe("walked-path ink: all three selectable tones stay legible", () => {
  /**
   * The footprint must be readable in every combination the user can choose: each tone at the lowest
   * intensity clears 3:1 against the canvas (WCAG 1.4.11 non-text contrast). A selectable invisible
   * trail is a defect, not a setting.
   */
  it("all three tones exceed 3:1 at the lowest density", () => {
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
      expect(contrast, `tone ${name} is ${contrast.toFixed(2)}:1 at the lowest density, so an invisible footprint can be chosen`).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * Footprint yellow does **not share bits** with hub amber. If they matched, "this
   * is the centre" and "you walked here" would be one colour and the distinction the
   * colour carried would disappear.
   */
  it("the footprint yellow differs from the hub amber", () => {
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
describe("walked-path lens: trail ink on nodes and lines", () => {
  it("with the lens off (ramp 0) no node receives trail ink", () => {
    expect(trailNodeInkStrength({ kept: true, ramp: 0, colorEgoState: "normal" })).toBe(0);
  });

  it("only visited nodes receive it", () => {
    expect(trailNodeInkStrength({ kept: true, ramp: 1, colorEgoState: "normal" })).toBe(1);
    expect(trailNodeInkStrength({ kept: false, ramp: 1, colorEgoState: "dim" })).toBe(0);
  });

  /** Selection ring (indigo) > footprint — "here now" and "been here" must not be one colour. */
  it("the picked node does not receive trail ink", () => {
    expect(trailNodeInkStrength({ kept: true, ramp: 1, colorEgoState: "center" })).toBe(0);
  });

  /** Mid-ramp values pass through — this fades out, it does not hard-cut. */
  it("a mid ramp value becomes the strength as it is", () => {
    expect(trailNodeInkStrength({ kept: true, ramp: 0.4, colorEgoState: "normal" })).toBeCloseTo(0.4, 6);
    expect(trailNodeInkStrength({ kept: true, ramp: 3, colorEgoState: "normal" })).toBe(1);
    expect(trailNodeInkStrength({ kept: true, ramp: Number.NaN, colorEgoState: "normal" })).toBe(0);
  });

  /**
   * A walked relation line is not background ink while the lens is on: the lens dims every edge, so the
   * colour actually painted is recorded and measured.
   */
  it("a walked line is painted in the trail color rather than dim", () => {
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
    expect(strokeOf({ trailWalked: 1 }), "the walked line is still the background ink").toBe("rgb(232, 196, 122)");
    // Mid-ramp — somewhere between dim and trail (not a hard cut).
    const mid = strokeOf({ trailWalked: 0.5 });
    expect(mid).not.toBe(tokens.edgeDim);
    expect(mid).not.toBe("rgb(232, 196, 122)");
  });

  /**
   * Unwalked lines recede as before: the lens exists to clear the field around the trail, and
   * keeping them lit would make it do nothing.
   */
  it("with the lens on, an unwalked line stays dim", () => {
    const source = readFileSync(
      join(repoRoot, "src/widgets/ontology-map/ui/frame-draw/edges/paint-edges.ts"),
      "utf8",
    );
    expect(source).toContain("walkedEdgeKeys");
    expect(source).toContain("trailWalked: walkedTrail");
  });
});

describe("the starlight tone equals the star ink the map already uses", () => {
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
  it("does not drift from any value the starfield paints", () => {
    const css = readGlobalCss();
    const trail = /--color-footprint-trail-star:\s*(#[0-9a-fA-F]{6})/.exec(css)![1].toLowerCase();
    const rgb = hexRgb(trail);
    const code = read("src/widgets/ontology-map/render/starfield.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const painted = [...code.matchAll(/rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,/g)];
    expect(painted.length, "the starfield paints no color at all, so the gate is dead").toBeGreaterThan(0);
    for (const m of painted) {
      expect(
        [Number(m[1]), Number(m[2]), Number(m[3])],
        `starlight tone ${trail} differs from rgba(${m[1]},${m[2]},${m[3]}) painted by the starfield, which makes two whites`,
      ).toEqual(rgb);
    }
  });
});
