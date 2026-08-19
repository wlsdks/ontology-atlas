import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 관문 본문 컬럼 상한(`--gateway-page-max`) — 넓은 폭 개정 2탄(2026-08-19)의
 * 불변식.
 *
 * 소유자의 2560 스크린샷 실측: 컬럼이 `--page-max`(1600)에서 멈춰 좌우 여백이
 * 각 480px — 화면의 37.5%가 빈 캔버스였다. 네 안 중 소유자가 고른 것은
 * **「관문에서만 넓힌다」** — 2560 에서 [320][1920][320], 다른 화면은 1600
 * 유지. 그래서 `--page-max` 를 올리는 대신 관문 전용 상한을 하나 더 두고,
 * 이 시험이 그 값이 지는 **약속**을 잠근다:
 *
 *  (a) **값 = 1920px** — 소유자 선택값. 무대 폭 게이트가 바닥 48rem 을
 *      못박는 것과 같은 형식의 결정값 고정이다.
 *  (b) **≤1920 무회귀 불변식 — 상한 ≥ `--page-max`** — 원점 공식이
 *      `max(홈통, (vw − 상한)/2)` 이고 컬럼이 `min(vw − 2×홈통, 상한)` 이라,
 *      상한이 `--page-max` 이상인 한 vw ≤ `--page-max` + 2×홈통(= 2000)
 *      구간에서는 종전 공식과 **바이트 동일한** 원점·컬럼이 나온다(양쪽 다
 *      홈통이 이기고 컬럼은 vw − 2×홈통). 이 성질이 깨지면 게이트가 지키는
 *      1440–1920 폭의 렌더가 조용히 움직인다.
 *  (c) **원점과 컬럼은 같은 상한을 읽는다** — `--gateway-origin` 공식이 이
 *      토큰을 소비한다. 한쪽만 바꾸면 컬럼은 넓어지는데 원점이 옛 수를 중앙
 *      삼아 좌우가 비대칭이 된다 — 「다섯 원소가 같은 x · 좌우 동일」을 지키는
 *      전제가 이 짝이다.
 *  (d) **컬럼 상한의 진실원은 하나다** — `PAGE_COLUMN`(shared/lib/
 *      gateway-frame.ts)이 이 토큰을 소비하고, 관문 표면 코드에
 *      `max-w-[var(--page-max)]` 가 남아 있지 않다. 반쪽 이행(컬럼만 넓고
 *      원점은 옛 상한, 또는 그 반대)이 이 저장소가 반복해서 잡아 온 그
 *      드리프트다.
 *  (e) **문서 등재** — `docs/DESIGN-SYSTEM.md` 관문 표에 같은 값이 있다.
 *      값이 코드에만 있으면 규격이 아니라 우연이다.
 *
 * 렌더된 컬럼·원점이 실제로 이 값을 따르는지(그리고 좌우가 같은지)는
 * `tests/e2e/download-gateway-grid.spec.ts` 가 폭별 rect 로 잰다 — 그 스펙은
 * `--gateway-origin` 계산값을 라이브로 읽으므로 여기 값이 바뀌면 자동으로
 * 따라간다. 여기는 정적 불변식, 거기는 실측이다.
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
        // 주석의 계보 서술이 아니라 className 문자열의 소비만 잡는다.
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
    // 낱말이 어딘가 흩어져 있는 것으로는 부족하다 — **같은 표 행** 안에서
    // 토큰과 값이 짝지어 있어야 등재다 (첫 게이트 프로브에서 행 이름만 바꿔도
    // 초록이던 구멍을 이 정규식이 막는다).
    const row = new RegExp(`^\\|[^|\\n]*\\|\\s*\`${TOKEN}\`\\s*\\|[^\\n]*\`${gatewayMax}px\``, "m");
    expect(
      row.test(doc),
      `관문 표에 「\`${TOKEN}\` | \`${gatewayMax}px\`」 행이 없다 — 값이 코드에만 있으면 규격이 아니라 우연이다`,
    ).toBe(true);
  });
});
