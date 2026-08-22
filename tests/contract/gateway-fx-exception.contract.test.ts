import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Gateway FX (current field, grain, cursor ring) — locks the reach of one charter
 * exception.
 *
 * The charter forbids animated gradient backgrounds (.claude/rules/forbidden.md ·
 * docs/DESIGN-SYSTEM.md Don'ts). The gateway landing remake (2026-08-18) opened
 * **one written exception** to it, in the same form as the footprint bloom
 * (shadowBlur): the exception is not hidden behind a setting but written out with
 * its conditions, its ceiling, and its gate.
 *
 * Four conditions, each checked here:
 *  (a) **Single consumer** — the `gateway-fx` prefix exists nowhere outside
 *      `src/views/download/**` and `app/globals.css` (token definitions). An eslint
 *      scope selector blocks it at edit time, and this filesystem scan is the last
 *      line (it still catches the case where the rule dies quietly).
 *  (b) **Everything stops under reduced-motion** — the current field's rAF loop does
 *      not run at all (one static frame), the cursor's lerp follow is downgraded to
 *      snapping instantly, and the gateway entrance choreography is replaced with
 *      "always visible" by a base-layer carve-out.
 *  (c) **Effect-layer alpha ceiling** — the light, grain, and starfield alphas are
 *      locked in tokens, stay under the ceiling, and consumers only produce alpha by
 *      reading those tokens (a literal alpha cannot bypass the ceiling).
 *  (d) **Documented** — the exception must exist in both the code and the charter
 *      document. Present only in code, the next auditor reads it as "this is
 *      forbidden, why is it here" and deletes it.
 */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

/** Walks every code and style file under `src/` and `app/` (no node_modules). */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(?:ts|tsx|css|mjs|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("관문 FX — 헌장 예외의 사정거리", () => {
  it("(a) gateway-fx 접두의 소비처는 관문 랜딩과 토큰 정의뿐이다", () => {
    const files = [
      ...walk(join(repoRoot, "src")),
      ...walk(join(repoRoot, "app")),
    ];
    const offenders: string[] = [];
    let consumers = 0;
    for (const file of files) {
      if (!readFileSync(file, "utf8").includes("gateway-fx")) continue;
      consumers += 1;
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      const allowed =
        rel.startsWith("src/views/download/") || rel === "app/globals.css";
      if (!allowed) offenders.push(rel);
    }
    expect(offenders, "gateway-fx 가 예외 사정거리 밖으로 샜다").toEqual([]);
    // Idling guard — finding no consumers at all means this scan guards nothing.
    expect(consumers, "gateway-fx 소비처를 하나도 못 찾았다 — 스캐너가 헛돈다").toBeGreaterThanOrEqual(2);
  });

  it("(a′) eslint 스코프 셀렉터가 살아 있다 — 편집 시점의 1차 방어선", () => {
    const eslintConfig = read("eslint.config.mjs");
    expect(eslintConfig).toContain("gatewayFxScopeSelectors");
    expect(eslintConfig).toContain("Literal[value=/gateway-fx/]");
    // The gateway view's own scope block — the exception's consumers are named there.
    expect(eslintConfig).toContain("files: ['src/views/download/**/*.{ts,tsx}']");
  });

  it("(b) 전류장은 reduced-motion 에서 rAF 루프를 돌리지 않는다", () => {
    const fx = read("src/views/download/ui/GatewayFx.tsx");
    expect(fx).toMatch(/prefers-reduced-motion/);
    // Reduced-motion branch: one static frame (draw(0)) — the loop starts only in the
    // else branch.
    expect(fx).toMatch(/if \(reduced\) \{\s*\n\s*draw\(0\);/);
    // The cursor lerp snaps instantly under reduced motion — a lagging cursor is not an
    // equivalent.
    expect(fx).toMatch(/!fxLoopLive \|\| reduced/);
  });

  it("(b′) 관문 등장 안무의 감속 동등물이 base 레이어 kill 규칙 뒤에 있다", () => {
    const css = read("app/globals.css");
    // The carve-out must sit inside the same layer as the global kill rule
    // (@layer base) and after it to win — an !important outside the layer loses to one
    // inside it (measured).
    const kill = css.indexOf("animation-duration: 0.01ms");
    const carve = css.indexOf(".gateway-rise,");
    expect(kill).toBeGreaterThan(-1);
    expect(carve, "관문 감속 carve-out 이 없다").toBeGreaterThan(-1);
    expect(carve, "carve-out 이 전역 kill 규칙보다 앞이라 조용히 진다").toBeGreaterThan(kill);
    const block = css.slice(carve, css.indexOf("}", carve));
    expect(block).toContain("opacity: 1 !important");
    expect(block).toContain("transform: none !important");
  });

  it("(c) 효과층 알파는 토큰으로 잠겨 있고 상한 안이다", () => {
    const css = read("app/globals.css");
    const readAlpha = (name: string): number => {
      const match = new RegExp(`${name}:\\s*([0-9.]+)`).exec(css);
      expect(match, `${name} 토큰이 없다`).toBeTruthy();
      return Number.parseFloat(match![1]);
    };
    // Ceiling: a background goes as far as atmosphere — the moment it competes with
    // body ink it is not a background.
    expect(readAlpha("--gateway-fx-blob-alpha")).toBeLessThanOrEqual(0.15);
    expect(readAlpha("--gateway-fx-grain-alpha")).toBeLessThanOrEqual(0.06);
    expect(readAlpha("--gateway-fx-dust-alpha")).toBeLessThanOrEqual(0.3);

    // Consumers produce alpha only by reading the token — rewriting it as a literal
    // bypasses the ceiling. The canvas light and starfield are read by the TSX via
    // computed style, and the grain is consumed directly by a CSS class as
    // `opacity: var(…)`.
    const fx = read("src/views/download/ui/GatewayFx.tsx");
    expect(fx).toContain("--gateway-fx-blob-alpha");
    expect(fx).toContain("--gateway-fx-dust-alpha");
    expect(css).toMatch(/\.gateway-fx-grain \{[^}]*opacity: var\(--gateway-fx-grain-alpha\)/);
    // The light's ink comes from the accent token — rewritten as hex it cannot follow
    // an accent switch.
    expect(fx).toContain("--color-indigo-brand");
  });

  it("(d) 헌장 문서에 예외가 등재돼 있다", () => {
    expect(read(".claude/rules/forbidden.md")).toMatch(/관문 전류장/);
  });
});
