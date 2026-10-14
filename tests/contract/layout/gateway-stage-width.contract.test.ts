import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";
import { collectTokens } from '../../../scripts/design/design-tokens.mjs';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Gateway stage width: the 48rem floor is pinned, the vw slope at 1920 must not exceed the floor,
 * the cap must not exceed the 1512px clip source, and the token has one consumer.
 */

const repoRoot = join(import.meta.dirname, "..", "..", "..");

const TOKEN = "--gateway-stage-max";

/** Extracts the three clamp values from the token declaration in globals.css. */
function parseStageClamp(css: string): { floorRem: number; slopeVw: number; capRem: number } {
  const match = css.match(
    /--gateway-stage-max:\s*clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)/,
  );
  expect(
    match,
    `${TOKEN} 이 app/globals.css 에 clamp(<rem>, <vw>, <rem>) 꼴로 선언돼 있어야 한다`,
  ).not.toBeNull();
  const [, floor, slope, cap] = match!;
  return { floorRem: Number(floor), slopeVw: Number(slope), capRem: Number(cap) };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(?:ts|tsx|css)$/.test(name)) out.push(full);
  }
  return out;
}

describe("관문 무대 폭 — --gateway-stage-max 의 불변식", () => {
  const css = readGlobalCss();
  const clamp = parseStageClamp(css);

  it("(a) 바닥은 48rem — 원장 (83) 의 소유자 승인값이다", () => {
    expect(clamp.floorRem).toBe(48);
  });

  it("(b) ≤1920 무회귀 — 기울기가 1920 에서 바닥을 넘지 않는다", () => {
    const slopeAt1920 = (clamp.slopeVw / 100) * 1920;
    const floorPx = clamp.floorRem * 16;
    expect(
      slopeAt1920,
      `The slope ${clamp.slopeVw}vw is ${slopeAt1920}px at 1920; once it passes the floor (${floorPx}px), ` +
        "the render at the 1440–1920 widths this gate protects moves",
    ).toBeLessThanOrEqual(floorPx);
  });

  it("(c) 상한은 클립 원본 폭(1512px)을 넘지 않는다", () => {
    const capPx = clamp.capRem * 16;
    expect(capPx).toBeGreaterThanOrEqual(clamp.floorRem * 16);
    expect(
      capPx,
      "상한이 클립 원본(1512px 폭)을 넘으면 1x 밀도에서 영상을 업스케일하게 된다",
    ).toBeLessThanOrEqual(1512);
  });

  it("(d) 무대 폭의 진실원은 토큰 하나다 — 소비 1곳 + 로컬 48rem 0곳", () => {
    const downloadFiles = walk(join(repoRoot, "src", "views", "download"));
    const consumers: string[] = [];
    const strays: string[] = [];
    for (const file of downloadFiles) {
      const text = readFileSync(file, "utf8");
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      if (text.includes("max-w-[var(--gateway-stage-max)]")) consumers.push(rel);
      // Catches hardcoded stage widths inside className strings, not in comments.
      if (/max-w-\[48rem\]/.test(text)) strays.push(rel);
    }
    expect(
      consumers.sort(),
      "시연 무대(DemoStage)만 토큰을 소비해야 한다 — 에이전트 장면은 근거 절의 격자에 선다",
    ).toEqual(["src/views/download/ui/DemoStage.tsx"]);
    expect(strays, "무대 폭을 따로 정하는 max-w-[48rem] 이 남아 있다").toEqual([]);
  });

  it("(e) pnpm design:tokens prints the declared formula", () => {
    const printed = collectTokens().filter((token) => token.name === TOKEN);
    expect(printed.length, `${TOKEN} is not printed by pnpm design:tokens`).toBeGreaterThan(0);
    expect(
      printed.map((token) => token.value),
      "the printer and the stylesheet disagree",
    ).toContain(`clamp(${clamp.floorRem}rem, ${clamp.slopeVw}vw, ${clamp.capRem}rem)`);
  });
});
