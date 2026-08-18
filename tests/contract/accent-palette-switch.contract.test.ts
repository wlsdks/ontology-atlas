import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";

/**
 * 악센트 팔레트 스위치의 계약 (2026-08-18).
 *
 * 앱의 유일한 채색이 **인디고(기본)** 와 **잉걸(대체)** 둘이 됐다. 값은
 * `app/globals.css` 에 두 벌로 있고, 고른 값은 `:root[data-accent]` 속성으로
 * 반영된다(`src/shared/lib/appearance-preferences.ts`).
 *
 * ⚠️ **어느 쪽이 기본인지를 이 파일에 적지 않는다.** 2026-08-18 하루에 기본이
 * 잉걸로 갔다가 인디고로 돌아왔다 — 그때 이 파일이 색 이름을 하드코딩하고
 * 있었더라면 되돌리는 PR 마다 계약 테스트가 「값 검사」가 아니라 「이름 고치기」
 * 로 바뀐다. 그래서 기본/대체는 `appearance-preferences.ts` 의 `DEFAULT_ACCENT`
 * 에서 읽고, CSS 의 덮어쓰기 선택자 이름도 거기서 **유도한다**.
 *
 * ## 이 계약이 막는 세 가지
 *
 * 1. **한쪽에만 있는 토큰.** 되돌림 블록이 기본 팔레트의 토큰 하나를 빠뜨리면,
 *    인디고를 고른 사람의 화면에서 그 자리만 구리색으로 남는다 — 그리고 그건
 *    기본값으로 쓰는 사람에게는 **영원히 안 보인다.** 두 팔레트의 토큰 집합이
 *    같은지 세는 것이 이 파일의 첫 번째 일이다.
 * 2. **한쪽만 대비를 지키는 것.** 색을 고르는 설정이 접근성을 고르는 설정이
 *    되면 안 된다. 두 팔레트 모두에서 채운 면 위 잉크가 AA(4.5:1)를 넘어야 한다.
 * 3. **깜빡임 방지 스크립트와 모듈의 어긋남.** `app/layout.tsx` 의 인라인
 *    스크립트는 페인트 전에 도는 대신 **문자열로 하드코딩된 키**를 쓴다. 모듈이
 *    키나 값을 바꾸면 그 스크립트가 조용히 아무것도 안 하게 되고, 증상은
 *    「가끔 색이 한 번 번쩍인다」라 아무도 버그로 안 적는다.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const css = read("app/globals.css");
const prefs = read("src/shared/lib/appearance-preferences.ts");
const boot = read("src/shared/ui/accent-boot-script.tsx");
const layout = read("app/layout.tsx");

/**
 * 기본 악센트 — 모듈이 정본. 여기서 읽어야 기본이 뒤집혀도 이 파일이 안 바뀐다.
 */
const DEFAULT_ACCENT = (() => {
  const m = /export const DEFAULT_ACCENT: Accent = "([a-z]+)"/.exec(prefs);
  expect(m, "appearance-preferences 에서 DEFAULT_ACCENT 를 못 찾는다").not.toBeNull();
  return (m as RegExpExecArray)[1];
})();

/** 고를 수 있는 두 값 중 기본이 **아닌** 쪽 — 덮어쓰기 블록을 갖는 팔레트. */
const ALT_ACCENT = (() => {
  const m = /export const ACCENTS: readonly Accent\[\] = \[([^\]]+)\]/.exec(prefs);
  expect(m, "appearance-preferences 에서 ACCENTS 를 못 찾는다").not.toBeNull();
  const values = [...(m as RegExpExecArray)[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
  expect(values, "악센트는 검증된 두 벌뿐이다").toHaveLength(2);
  const alt = values.filter((v) => v !== DEFAULT_ACCENT);
  expect(alt, "ACCENTS 에 DEFAULT_ACCENT 가 없다").toHaveLength(1);
  return alt[0];
})();

const ALT_SELECTOR = `:root[data-accent="${ALT_ACCENT}"]`;

/** 대체 팔레트 블록 본문 — `:root[data-accent="<대체>"] { … }` 안쪽. */
function revertBlock(): string {
  const start = css.indexOf(ALT_SELECTOR);
  expect(start, `대체 팔레트 블록(${ALT_SELECTOR})이 globals.css 에 없다`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open + 1, close);
}

function tokenNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/(--color-indigo[a-z0-9-]*)\s*:/g)) names.add(m[1]);
  return names;
}

function tokenValue(source: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(source);
  return m ? m[1].trim() : null;
}

/** 대체 블록을 뺀 나머지 = 기본 팔레트가 정의된 곳. */
const baseSource = (() => {
  const block = revertBlock();
  return css.split(block).join("");
})();

describe("악센트 팔레트 스위치 — 두 벌이 같은 것을 덮는다", () => {
  it("되돌림 팔레트가 기본 팔레트의 토큰을 하나도 빠뜨리지 않는다", () => {
    const base = tokenNames(baseSource);
    const revert = tokenNames(revertBlock());

    expect(base.size, "기본 팔레트 토큰을 하나도 못 찾았다 — 이 검사가 헛돌고 있다").toBeGreaterThan(30);

    const missing = [...base].filter((name) => !revert.has(name));
    expect(
      missing,
      "되돌림 팔레트에 없는 토큰 — 인디고를 고른 사람 화면에서 이 자리만 구리색으로 남는다",
    ).toEqual([]);
  });

  it("되돌림 팔레트에 기본 팔레트에 없는 토큰을 만들지 않는다", () => {
    const base = tokenNames(baseSource);
    const extra = [...tokenNames(revertBlock())].filter((name) => !base.has(name));
    expect(extra, "기본 팔레트에 없는 토큰을 되돌림에서만 정의했다 — 죽은 값이다").toEqual([]);
  });

  it("두 팔레트 모두에서 채운 면 위 흰 글자가 AA 를 넘는다", () => {
    const white = parseColor("#ffffff")!;
    for (const [label, source] of [
      [`${DEFAULT_ACCENT}(기본)`, baseSource],
      [`${ALT_ACCENT}(대체)`, revertBlock()],
    ] as const) {
      for (const token of ["--color-indigo-brand", "--color-indigo-brand-hover"]) {
        const raw = tokenValue(source, token);
        expect(raw, `${label}: ${token} 값을 못 읽는다`).not.toBeNull();
        const fill = parseColor(raw as string);
        expect(fill, `${label}: ${token}(${raw}) 를 색으로 못 읽는다`).not.toBeNull();
        const ratio = contrastRatio(white, fill as number[]);
        expect(
          ratio,
          `${label}: 흰 글자가 ${token} 위에서 ${ratio.toFixed(2)}:1 — 색을 고르는 설정이 접근성을 고르는 설정이 되면 안 된다`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("두 팔레트의 값이 실제로 다르다 — 스위치가 아무것도 안 바꾸고 있지 않다", () => {
    /*
     * `/gate-probe`: 빈 집합 위에서 공회전하는 검출기를 금지한다. 되돌림 블록을
     * 실수로 기본값과 같게 채워 넣으면 위 세 검사는 전부 초록인데 설정만 죽는다.
     */
    const base = tokenValue(baseSource, "--color-indigo-brand");
    const revert = tokenValue(revertBlock(), "--color-indigo-brand");
    expect(revert, "되돌림 팔레트의 브랜드 색이 기본과 같다 — 스위치가 아무 일도 안 한다").not.toBe(base);
  });
});

describe("깜빡임 방지 스크립트가 모듈과 같은 계약을 쓴다", () => {
  it("localStorage 키가 모듈의 상수와 같다", () => {
    const m = /const ACCENT_KEY = "([^"]+)"/.exec(prefs);
    expect(m, "appearance-preferences 에서 ACCENT_KEY 를 못 찾는다").not.toBeNull();
    const key = (m as RegExpExecArray)[1];
    expect(
      boot.includes(key),
      `부트 스크립트가 키 '${key}' 를 안 쓴다 — 페인트 전 적용이 조용히 죽고, 증상은 「가끔 색이 한 번 번쩍인다」라 아무도 버그로 안 적는다`,
    ).toBe(true);
  });

  it("스크립트가 심는 속성·값이 CSS 선택자와 짝이 맞는다", () => {
    expect(boot).toContain("data-accent");
    expect(boot, `스크립트가 '${ALT_ACCENT}' 를 심지 않는다`).toContain(`'${ALT_ACCENT}'`);
    expect(
      boot,
      `스크립트가 기본값 '${DEFAULT_ACCENT}' 를 속성으로 심는다 — 기본값이 DOM 에 굳는다`,
    ).not.toContain(`'${DEFAULT_ACCENT}'`);
    expect(css, "CSS 에 짝이 되는 선택자가 없다").toContain(ALT_SELECTOR);
  });

  it("부트 스크립트는 실제로 레이아웃에 실린다", () => {
    expect(
      layout,
      "layout.tsx 가 AccentBootScript 를 안 그린다 — 파일만 있고 아무 데도 안 실리면 설정이 새로고침에서 죽는다",
    ).toContain("<AccentBootScript />");
  });

  it("부트 스크립트 본문에 데이터 보간이 없다 — script 경계를 닫을 수 없다", () => {
    /*
     * `json-ld-script-safety` 가 지키는 것과 같은 성질이다: 문자열이 전부
     * 상수이고 보간이 없으면 데이터가 `</script>` 로 경계를 닫는 사고를
     * 원리적으로 못 낸다. 값을 받는 스크립트가 필요해지면 이 파일이 아니라
     * `JsonLd` 처럼 이스케이프를 책임지는 경계를 새로 만들어야 한다.
     */
    const body = /const ACCENT_BOOT = \[([\s\S]*?)\]\.join/.exec(boot);
    expect(body, "부트 스크립트 본문을 못 찾는다").not.toBeNull();
    expect(
      (body as RegExpExecArray)[1],
      "부트 스크립트에 템플릿 보간이 생겼다 — 이스케이프 책임이 있는 경계로 옮겨라",
    ).not.toContain("${");
  });

  it("기본값은 속성을 심지 않는다 — 기본값이 DOM 에 굳지 않게", () => {
    /*
     * `applyAccentAttribute` 가 기본값에서 속성을 **지우는** 계약. 남겨 두면
     * 「기본값이라 속성이 있는 상태」와 「명시적으로 고른 상태」가 구별되지 않아,
     * 나중에 기본값을 바꿀 때 옛 기본값이 속성으로 굳는다.
     */
    expect(prefs).toMatch(/if \(value === DEFAULT_ACCENT\) root\.removeAttribute/);
  });
});
