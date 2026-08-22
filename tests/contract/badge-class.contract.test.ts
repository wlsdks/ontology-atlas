import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { badgeClass, type BadgeShape } from "../../src/shared/ui/badge-class";

/**
 * The static badge value-layer contract — it judges **the string cva composes**.
 *
 * This is a layer lint cannot see: the code carries only keys such as
 * `shape: 'pill'` and the real values are composed at runtime, so
 * `no-restricted-syntax` has no string to look at (same form and same reason as
 * `control-class.contract.test.ts`).
 *
 * Four properties locked:
 * 1. Every shape's output is **inside the ramp** — radius steps and type steps
 *    only. An off-ramp literal (`px-[3px]`, `#hex`, `text-sm`) fails.
 * 2. Axes do not grow quietly — one `shape`, three shapes.
 * 3. **Colour and tracking are not emitted by the value layer.** Measurement found
 *    60 distinct colour combinations (largest cluster 2), so there was no majority
 *    to converge on and adding a tone axis would create an option with 0 consumers.
 *    This assertion pins that judgement — adding tone later requires editing this
 *    line, and that diff demands evidence.
 * 4. The default is the quietest shape.
 */

const ROOT = process.cwd();
const SHAPES: BadgeShape[] = ["micro", "tag", "pill"];

/** The radius and type step names the ramp defines. `app/globals.css` owns the values. */
const RADIUS_STEPS = ["rounded-micro", "rounded-chip", "rounded-full"];
const TYPE_STEPS = ["text-caption", "text-label"];

describe("badgeClass — 정적 배지 값 층", () => {
  const all = SHAPES.map((shape) => ({ shape, out: badgeClass({ shape }) }));

  it("탐지기가 공회전하지 않는다 — 세 모양을 실제로 만든다", () => {
    expect(all).toHaveLength(3);
    for (const c of all) expect(c.out.length).toBeGreaterThan(20);
  });

  it("모든 조합이 램프 안에서만 값을 낸다", () => {
    const offenders: string[] = [];
    for (const { shape, out } of all) {
      const label = shape;
      // Exactly one radius ramp step.
      const radii = RADIUS_STEPS.filter((r) => new RegExp(`\\b${r}\\b`).test(out));
      if (radii.length !== 1) offenders.push(`${label}: 반경 스텝 ${radii.length}개`);
      // Exactly one type ramp step.
      const types = TYPE_STEPS.filter((t) => new RegExp(`\\b${t}\\b`).test(out));
      if (types.length !== 1) offenders.push(`${label}: 타입 스텝 ${types.length}개`);
      // Colours must be tokens — no raw hex, no Tailwind palette.
      if (/#[0-9a-fA-F]{3,8}/.test(out)) offenders.push(`${label}: hex 리터럴`);
      if (/\b(?:text|bg|border)-(?:white|black|slate|gray|zinc|red|amber|indigo)-\d/.test(out)) {
        offenders.push(`${label}: Tailwind 팔레트`);
      }
      // No arbitrary length values (px-[3px] and friends).
      if (/\b(?:px|py|p|text|rounded)-\[[0-9.]/.test(out)) offenders.push(`${label}: 램프 밖 리터럴`);
    }
    expect(offenders, "값 층이 램프 밖으로 샜다").toEqual([]);
  });

  it("축이 조용히 늘지 않는다 — shape 3, 그리고 색·자간 축은 없다", () => {
    const source = readFileSync(path.join(ROOT, "src/shared/ui/badge-class.ts"), "utf8");
    const variants = source.slice(source.indexOf("variants: {"), source.indexOf("defaultVariants"));
    const axes = (variants.match(/^\s{4}[a-z]+: \{/gm) ?? []).map((s) => s.trim().replace(": {", ""));
    expect(axes, "축이 늘거나 줄었다 — 「체계」 소집이 먼저다").toEqual(["shape"]);
    const shapes = (variants.match(/^\s{6}[a-z]+:/gm) ?? []).length;
    expect(shapes, "shape 가 3을 벗어났다").toBe(3);
  });

  it("색·자간을 값 층이 내지 않는다 — 실측에 다수파가 없어 일부러 뺀 축이다", () => {
    for (const { shape, out } of all) {
      expect(out, `${shape}: 색이 값 층으로 들어왔다`).not.toMatch(/\b(?:bg|text)-\[color:/);
      expect(out, `${shape}: 자간이 값 층으로 들어왔다`).not.toMatch(/tracking-\[/);
      expect(out, `${shape}: 대문자 처리가 값 층으로 들어왔다`).not.toMatch(/uppercase/);
    }
  });

  it("기본값은 가장 조용한 모양이다 — tag", () => {
    expect(badgeClass()).toBe(badgeClass({ shape: "tag" }));
  });

  it("className 은 규격을 덮지 않고 자리잡기만 더한다", () => {
    const out = badgeClass({ shape: "pill", className: "ml-2 max-w-[12ch] truncate" });
    expect(out).toContain("rounded-full");
    expect(out).toContain("truncate");
  });
});
