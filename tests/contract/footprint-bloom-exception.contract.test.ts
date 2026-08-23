import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOOTPRINT,
  FOOTPRINT_RANGES,
  resolveFootprint,
} from "@/shared/lib/appearance-preferences";
import { trailNodeInkStrength } from "@/widgets/topology-map-v2/model/focus-state";
import { draw as traceDraw } from "@/widgets/topology-map-v2/render/traces";

/**
 * Footprint "bloom" — locks the reach of the charter's single exception.
 *
 * ## Why lint alone is not enough
 *
 * The shadowBlur selector in `eslint.config.mjs` only sees **which file uses a
 * glow**. The exception can leak in two directions while still passing that rule:
 *
 * 1. **The default stops being 0** — then the app ships with a glow that nobody
 *    switched on. The entire "it is opt-in, so it complies with the charter"
 *    argument rests on that default of 0.
 * 2. **The cap rises** — 6px means "the mark's edge blooms"; 12px makes the halo
 *    larger than the mark itself, which is the forbidden glow.
 *
 * Both are **a one-value edit**, which is exactly what slips through review. So
 * they are locked by value.
 *
 * ## Why the charter document is read too
 *
 * An exception must be registered in **both** code and documentation. In code only,
 * the next auditor reads it as "this is forbidden, why is it here" and deletes it;
 * in documentation only, it is not enforced (a lesson this repository has learned
 * repeatedly). So this test also checks that the exception is alive in the
 * document.
 */

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

describe("발자국 번짐 — 헌장 예외의 사정거리", () => {
  it("기본값은 0 이다 — 아무도 켜지 않으면 글로우는 존재하지 않는다", () => {
    expect(DEFAULT_FOOTPRINT.bloom).toBe(0);
  });

  it("상한은 6px 다 — 자국 본체보다 헤일로가 커지는 값은 못 고른다", () => {
    expect(FOOTPRINT_RANGES.bloom.max).toBe(6);
    expect(FOOTPRINT_RANGES.bloom.min).toBe(0);
  });

  it("저장값이 상한을 넘겨도 잘려 들어온다 — localStorage 로 우회할 수 없다", () => {
    expect(resolveFootprint({ bloom: 999 }).bloom).toBe(6);
    expect(resolveFootprint({ bloom: -5 }).bloom).toBe(0);
  });

  /**
   * **Exactly one file** uses a glow. If that grows it has become a convention
   * rather than an exception, and at that moment the charter is a lie.
   */
  it("shadowBlur 소비처는 발자국 렌더러 하나뿐이다", () => {
    const eslintConfig = read("eslint.config.mjs");
    expect(eslintConfig).toContain('MemberExpression[property.name="shadowBlur"]');
    expect(eslintConfig).toContain("src/shared/lib/footprint-glyph.ts");
  });

  it("헌장 두 문서에 예외가 등재돼 있다 — 코드에만 있으면 다음 사람이 지운다", () => {
    expect(read(".claude/rules/forbidden.md")).toMatch(/footprint-trail bloom/i);
    expect(read(".claude/rules/design.md")).toMatch(/footprint trail/i);
  });

  /**
   * The footprint must be readable in **every combination the user can choose**.
   *
   * Defect found by measurement (2026-07-29): with the indigo tone at
   * `--color-indigo-accent` (#7170ff), the lowest intensity (0.5) gave **2.08:1**
   * against the canvas — below 3:1. "Indigo plus subtle" is a selectable
   * combination, so that is not a matter of taste but **a selectable defect**. The
   * freedom to make something invisible is not a setting.
   *
   * It is the kind of thing a single value edit breaks again, so it is locked by
   * value. WCAG 1.4.11 non-text contrast, 3:1.
   */
  it("두 톤 모두 최저 진하기에서 3:1 을 넘는다", () => {
    const css = read("app/globals.css");
    const bg = hexRgb(/--topology-v2-canvas-bg-near:\s*(#[0-9a-fA-F]{6})/.exec(css)![1]);
    const tones = {
      amber: /--color-footprint-trail:\s*(#[0-9a-fA-F]{6})/.exec(css)![1],
      indigo: /--color-footprint-trail-indigo:\s*(#[0-9a-fA-F]{6})/.exec(css)![1],
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
    const css = read("app/globals.css");
    const hub = /--topology-v2-amber-hub:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase();
    const trail = /--color-footprint-trail:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase();
    expect(hub).toBeDefined();
    expect(trail).toBeDefined();
    expect(trail).not.toBe(hub);
  });
});

/**
 * The "path walked" lens tinting **nodes and relation lines too** with the trail
 * colour — reported by the owner on 2026-08-02: *"Should the selected node light up?
 * In yellow, including the lines?"* (the selected node should light up — in yellow, lines
 * included?).
 *
 * This is an **extension** of amber, so why it stays inside the charter is proved
 * by value:
 *
 * - **The same ink** — no new hue is opened. Both the node stroke and the relation
 *   line use `--color-footprint-trail` (one of the user's two choices) as is. That
 *   it differs from hub amber is already locked by the test above.
 * - **Lens-scoped** — only while the popover is open. When the ramp is 0 the ink is
 *   0, so this is not permanent amber. Same structure as the two preceding
 *   exceptions (the agent focus ring and the recent-change spotlight).
 * - **Not a glow** — `shadowBlur` still has exactly one consumer, the footprint
 *   renderer (test above). What grows here is contrast, not bloom.
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
   * A walked relation line is **not background ink** while the lens is on. That was
   * the core of the defect the owner saw: the lens dimmed every edge, so the "path
   * walked" showed no path. The colour actually painted is recorded and measured.
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
   * Unwalked lines **recede as before** — the 2026-08-02 verdict on what happens to
   * what was not visited: it dims. Clearing the field the moment the trail is read is
   * this lens's reason for existing, so keeping unwalked relations lit would mean the
   * lens did nothing.
   */
  it("렌즈가 켜져도 안 밟은 선은 dim 그대로다", () => {
    const source = readFileSync(
      join(repoRoot, "src/widgets/topology-map-v2/ui/topology-frame-draw.ts"),
      "utf8",
    );
    expect(source).toContain("walkedEdgeKeys");
    expect(source).toContain("trailWalked: walkedTrail");
  });
});
