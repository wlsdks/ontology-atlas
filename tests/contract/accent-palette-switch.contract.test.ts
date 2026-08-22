import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";

/**
 * The accent palette switch contract (2026-08-18).
 *
 * The app's single colour is now two: **indigo (default)** and **ember
 * (alternate)**. The values exist twice in `app/globals.css`, and the choice is
 * reflected through the `:root[data-accent]` attribute
 * (`src/shared/lib/appearance-preferences.ts`).
 *
 * ⚠️ **Which one is the default is not written in this file.** On 2026-08-18 the
 * default moved to ember and back to indigo within a day — had this file hard-coded
 * a colour name, every reverting PR would turn the contract test from "check the
 * values" into "fix the names". So default and alternate are read from
 * `DEFAULT_ACCENT` in `appearance-preferences.ts`, and the CSS override selector
 * name is **derived** from it.
 *
 * **The three things this contract blocks:**
 *
 * 1. **A token present on only one side.** If the override block omits one token
 *    from the default palette, that one place stays copper on the screen of anyone
 *    who chose indigo — and it is **invisible forever** to anyone on the default.
 *    Counting that both palettes carry the same token set is this file's first job.
 * 2. **Contrast held on only one side.** Choosing a colour must not become choosing
 *    accessibility. Ink on a filled surface must clear AA (4.5:1) in both palettes.
 * 3. **Drift between the anti-flash script and the module.** The inline script in
 *    `app/layout.tsx` runs before paint and therefore uses a **hard-coded string
 *    key**. If the module changes the key or the values, that script quietly stops
 *    doing anything, and the symptom — "the colour flashes once sometimes" — is
 *    something nobody files as a bug.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const css = read("app/globals.css");
const prefs = read("src/shared/lib/appearance-preferences.ts");
const boot = read("src/shared/ui/accent-boot-script.tsx");
const layout = read("app/layout.tsx");

/**
 * The default accent — the module is authoritative. Reading it here means this file
 * does not change when the default flips.
 */
const DEFAULT_ACCENT = (() => {
  const m = /export const DEFAULT_ACCENT: Accent = "([a-z]+)"/.exec(prefs);
  expect(m, "appearance-preferences 에서 DEFAULT_ACCENT 를 못 찾는다").not.toBeNull();
  return (m as RegExpExecArray)[1];
})();

/** Of the two selectable values, the one that is **not** the default — the palette with the override block. */
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

/** The alternate palette block body — inside `:root[data-accent="<alternate>"] { … }`. */
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

/** Everything outside the alternate block = where the default palette is defined. */
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
     * `/gate-probe`: no detector may idle on an empty set. Filling the override block
     * with the same values as the default keeps all three checks above green while the
     * setting itself is dead.
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
     * The same property `json-ld-script-safety` guards: when every string is a constant
     * and nothing is interpolated, data cannot close the boundary with `</script>` even
     * in principle. If a script that takes values becomes necessary, the answer is a new
     * boundary that owns escaping (like `JsonLd`), not this file.
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
     * The contract that `applyAccentAttribute` **removes** the attribute for the
     * default. Leaving it makes "has the attribute because it is the default"
     * indistinguishable from "explicitly chosen", so a later change of default freezes
     * the old default into the attribute.
     */
    expect(prefs).toMatch(/if \(value === DEFAULT_ACCENT\) root\.removeAttribute/);
  });
});
