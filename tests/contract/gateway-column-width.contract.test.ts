import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";
import { collectTokens } from '../../scripts/design-tokens.mjs';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * Gateway body column cap: at or below 1920 origin and column must equal the old `--page-max`
 * formula, and origin, column and `PAGE_COLUMN` must all read this one token.
 */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const TOKEN = "--gateway-page-max";

function parsePx(css: string, token: string): number {
  const match = css.match(new RegExp(`${token}:\\s*([\\d.]+)px\\s*;`));
  expect(match, `${token} 이 app/globals.css 에 <숫자>px 꼴로 선언돼 있어야 한다`).not.toBeNull();
  return Number(match![1]);
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

describe("관문 본문 컬럼 상한 — --gateway-page-max 의 불변식", () => {
  const css = readGlobalCss();
  const gatewayMax = parsePx(css, TOKEN);
  const pageMax = parsePx(css, "--page-max");

  it("(a) 값은 1920px — 소유자 선택값(2560 에서 [320][1920][320])이다", () => {
    expect(gatewayMax).toBe(1920);
  });

  it("(b) ≤1920 무회귀 — 상한이 --page-max 밑으로 내려가지 않는다", () => {
    expect(
      gatewayMax,
      `With the cap (${gatewayMax}) below --page-max (${pageMax}), the origin and columns for vw ≤ ${pageMax + 400} ` +
        "differ from the previous formula, so the render at the 1440–1920 widths this gate protects moves",
    ).toBeGreaterThanOrEqual(pageMax);
  });

  it("(c) 정렬 원점 공식이 같은 상한을 소비한다 — 컬럼과 원점은 한 짝이다", () => {
    const origin = css.match(/--gateway-origin:\s*max\(([\s\S]*?)\);/);
    expect(origin, "--gateway-origin 이 max(…) 꼴로 선언돼 있어야 한다").not.toBeNull();
    expect(
      origin![1],
      "원점 공식이 --gateway-page-max 를 읽지 않는다 — 컬럼만 넓어지고 중앙이 옛 상한에 남아 좌우가 비대칭이 된다",
    ).toContain(`var(${TOKEN})`);
    expect(
      origin![1],
      "원점 공식에 --page-max 가 남아 있다 — 상한의 진실원은 하나여야 한다",
    ).not.toContain("var(--page-max)");
  });

  it("(d) 컬럼 상한의 진실원은 토큰 하나다 — PAGE_COLUMN 소비 + 관문 코드에 --page-max 0곳", () => {
    const frame = read("src/shared/lib/public-pages/gateway-frame.ts");
    expect(
      frame,
      "PAGE_COLUMN 이 max-w-[var(--gateway-page-max)] 를 소비해야 한다",
    ).toContain(`max-w-[var(${TOKEN})]`);

    const gatewayDirs = [
      join(repoRoot, "src", "views", "download"),
      join(repoRoot, "src", "views", "gateway-doc"),
      join(repoRoot, "src", "widgets", "gateway-chrome"),
    ];
    const strays: string[] = [];
    for (const dir of gatewayDirs) {
      for (const file of walk(dir)) {
        // Catches consumption in className strings, not lineage described in comments.
        if (readFileSync(file, "utf8").includes("max-w-[var(--page-max)]")) {
          strays.push(relative(repoRoot, file).replace(/\\/g, "/"));
        }
      }
    }
    expect(
      strays,
      "관문 표면이 --page-max 를 컬럼 상한으로 직접 소비하고 있다 — 반쪽 이행이다",
    ).toEqual([]);
  });

  it("(e) pnpm design:tokens prints the declared value", () => {
    const printed = collectTokens().filter((token) => token.name === TOKEN);
    expect(printed.length, `${TOKEN} is not printed by pnpm design:tokens`).toBeGreaterThan(0);
    expect(printed.map((token) => token.value), "the printer and the stylesheet disagree").toContain(`${gatewayMax}px`);
  });
});
