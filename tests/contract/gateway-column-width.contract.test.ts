import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The gateway body column cap (`--gateway-page-max`) — the invariants of the
 * second wide-width revision (2026-08-19).
 *
 * Measured from the owner's 2560 screenshot: the column stopped at `--page-max`
 * (1600), leaving 480px of margin on each side — 37.5% of the screen was empty
 * canvas. Of four options the owner chose **"widen the gateway only"** —
 * [320][1920][320] at 2560, every other screen stays at 1600. So instead of
 * raising `--page-max`, a gateway-only cap was added, and this test locks the
 * **promises** that value carries:
 *
 *  (a) **Value = 1920px** — the owner's chosen value. The same form of pinned
 *      decision as the stage-width gate pinning a 48rem floor.
 *  (b) **No-regression invariant at ≤1920 — cap ≥ `--page-max`.** The origin
 *      formula is `max(gutter, (vw − cap)/2)` and the column is
 *      `min(vw − 2×gutter, cap)`, so as long as the cap is at least `--page-max`,
 *      every vw ≤ `--page-max` + 2×gutter (= 2000) yields **byte-identical**
 *      origin and column to the old formula (in both, the gutter wins and the
 *      column is vw − 2×gutter). Break this property and the 1440–1920 renders the
 *      gate protects move silently.
 *  (c) **Origin and column read the same cap** — the `--gateway-origin` formula
 *      consumes this token. Change only one and the column widens while the origin
 *      centres on the old number, making the sides asymmetric — this pairing is the
 *      premise behind "five elements on the same x, sides equal".
 *  (d) **One source of truth for the column cap** — `PAGE_COLUMN`
 *      (shared/lib/gateway-frame.ts) consumes this token, and no
 *      `max-w-[var(--page-max)]` remains in gateway surface code. A half migration
 *      (column widened, origin still on the old cap, or the reverse) is the drift
 *      this repository has caught repeatedly.
 *  (e) **Documented** — the gateway table in `docs/DESIGN-SYSTEM.md` carries the
 *      same value. A value that exists only in code is a coincidence, not a spec.
 *
 * Whether the rendered column and origin actually follow this value (and whether
 * the sides match) is measured per width with rects by
 * `tests/e2e/download-gateway-grid.spec.ts` — that spec reads the computed
 * `--gateway-origin` live, so it follows automatically when this value changes.
 * Static invariants here; measurement there.
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
  const css = read("app/globals.css");
  const gatewayMax = parsePx(css, TOKEN);
  const pageMax = parsePx(css, "--page-max");

  it("(a) 값은 1920px — 소유자 선택값(2560 에서 [320][1920][320])이다", () => {
    expect(gatewayMax).toBe(1920);
  });

  it("(b) ≤1920 무회귀 — 상한이 --page-max 밑으로 내려가지 않는다", () => {
    expect(
      gatewayMax,
      `상한(${gatewayMax})이 --page-max(${pageMax}) 미만이면 vw ≤ ${pageMax + 400} 구간의 ` +
        "원점·컬럼이 종전 공식과 달라진다 — 게이트가 지키는 1440–1920 폭의 렌더가 움직인다",
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
    const frame = read("src/shared/lib/gateway-frame.ts");
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

  it("(e) DESIGN-SYSTEM.md 관문 표에 같은 값이 등재돼 있다", () => {
    const doc = read("docs/DESIGN-SYSTEM.md");
    // Words scattered anywhere are not enough — the token and value must be paired
    // **within the same table row** to count as documented (this regex closes the
    // hole the first gate probe found, where renaming the row alone kept it green).
    const row = new RegExp(`^\\|[^|\\n]*\\|\\s*\`${TOKEN}\`\\s*\\|[^\\n]*\`${gatewayMax}px\``, "m");
    expect(
      row.test(doc),
      `관문 표에 「\`${TOKEN}\` | \`${gatewayMax}px\`」 행이 없다 — 값이 코드에만 있으면 규격이 아니라 우연이다`,
    ).toBe(true);
  });
});
