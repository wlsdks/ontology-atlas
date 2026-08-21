import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";

/**
 * **꽉 찬 브랜드 면 위의 잉크 라이선스** (2026-08-15).
 *
 * ## 어디가 비어 있었나
 *
 * 이 저장소에는 인디고 잉크 라이선스가 이미 있다 —
 * `accent-ink-contrast.contract.test.ts` 가 **틴트 위**(알파 인디고 채움 위)에
 * 어떤 인디고 잉크를 얹어도 되는지를 대비 실측으로 잠근다. 그런데 그 계약은
 * 잉크가 **인디고일 때**만 판정하고, 바탕이 **100% 불투명한 브랜드 면**
 * (`--color-indigo-brand`)일 때 그 위에 무슨 잉크를 얹어도 되는지는
 * **아무 검사도 보지 않았다.**
 *
 * 그 구멍으로 실제로 샜다(2026-08-15 배지 색 역할 전수). 브랜드 면 위에 글자를
 * 얹은 자리 4곳 중 **3곳이 `--color-text-primary`(#f7f8f8)** 였고, 그 짝은
 * 9.5px 글자에 **4.42:1 — AA(4.5) 미달**이다. 나머지 1곳만 올바른
 * `--color-text-on-accent`(#ffffff, 4.70:1)를 쓰고 있었다.
 *
 * 값은 하나도 안 틀렸다 — 셋 다 정당한 램프 토큰이다. 틀린 것은 **자리**다.
 * `design-gates.md` 「값이 아니라 «자리» 가 토큰을 정한다」가 2026-08-05 에
 * 정확히 같은 병(`text-white` 3곳)을 진단하고 같은 처방(`text-on-accent`)을
 * 냈는데, **그때 게이트를 세우지 않아서 세 자리가 다시 났다.**
 *
 * ## 판정은 허용목록이 아니라 계산이다
 *
 * 「이 토큰만 된다」로 적으면 그 목록이 `globals.css` 와 어긋나는 날 검사가
 * 조용히 틀린다. 그래서 여기서는 **토큰 값을 읽어 대비를 계산**하고, 4.5:1 을
 * 넘는 잉크면 통과시킨다(`accent-ink-contrast` 와 같은 문법). 토큰 값이
 * 움직이면 이 시험이 그 순간의 진실을 다시 계산한다.
 *
 * ## 무엇을 안 보나
 *
 * - **글자 없는 브랜드 면** — 점·막대·밑줄·진행 표시. 잉크가 없으므로 §1.4.3
 *   의 대상이 아니다(§1.4.11 은 별도 계약의 일).
 * - **틴트 채움**(`--color-indigo-a*`) — `accent-ink-contrast` 의 관할이다.
 *   여기서 다시 세면 두 게이트가 같은 자리를 두 번 판정하고, 둘이 어긋나는
 *   날 어느 쪽이 규격인지 알 수 없게 된다.
 */

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

type Rgba = readonly number[];

/** `app/globals.css` 첫 정의 우선. `var()` 별칭은 따라간다. */
function cssToken(name: string): Rgba {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`globals.css 에 ${name} 이 없다`);
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(v.slice(4, -1).trim());
  const parsed = parseColor(v);
  if (!parsed) throw new Error(`${name} 값(${v})을 색으로 못 읽는다`);
  return parsed as Rgba;
}

/**
 * 100% 불투명한 «브랜드 면» — 이 위에 얹히는 잉크가 이 계약의 대상이다.
 * 알파 틴트는 여기 넣지 않는다(위 「무엇을 안 보나」).
 */
const SOLID_FILLS = {
  "indigo-brand": cssToken("--color-indigo-brand"),
  "indigo-brand-hover": cssToken("--color-indigo-brand-hover"),
} as const;

const AA = 4.5;

const ratioOn = (ink: Rgba, bg: Rgba) => contrastRatio(composite(ink, bg), bg);

describe("브랜드 면 위 잉크 — 라이선스는 값이 아니라 대비가 낸다", () => {
  it("탐지기가 공회전하지 않는다 — 면 토큰이 실재하고 불투명하다", () => {
    const names = Object.keys(SOLID_FILLS);
    expect(names.length, "볼 면이 하나도 없다").toBeGreaterThan(0);
    for (const [name, fill] of Object.entries(SOLID_FILLS)) {
      expect(fill[3], `${name} 이 불투명하지 않다 — 그러면 틴트 계약의 관할이다`).toBe(1);
    }
  });

  it("지정된 잉크가 라이선스를 만족한다 — text-on-accent 는 모든 브랜드 면에서 AA", () => {
    const onAccent = cssToken("--color-text-on-accent");
    for (const [name, fill] of Object.entries(SOLID_FILLS)) {
      const r = ratioOn(onAccent, fill);
      expect(r, `text-on-accent 가 ${name} 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("분리의 근거가 아직 실재한다 — text-primary 는 브랜드 면에서 실제로 AA 를 깬다", () => {
    /*
     * `/gate-probe`: 빈 집합 위에서 공회전하는 검출기를 금지한다. 이 단언이
     * 빨개지는 날은 두 잉크가 수렴해 아무 데나 써도 되는 날이고, 그날 이
     * 계약은 접을 수 있다. 오늘은 4.42 대 4.70 으로 갈린다.
     */
    const primary = cssToken("--color-text-primary");
    const r = ratioOn(primary, SOLID_FILLS["indigo-brand"]);
    expect(
      r,
      `text-primary 가 브랜드 면에서 ${r.toFixed(2)}:1 — AA 를 통과한다면 이 계약의 존재 이유를 재평가하라`,
    ).toBeLessThan(AA);
  });
});

/**
 * 소스 스캔 — 브랜드 면을 진 **className 리터럴**에 얹힌 잉크가 라이선스 안인가.
 *
 * ## 왜 「여는 태그」가 아니라 「리터럴」인가 (이 게이트를 만들며 밟은 함정)
 *
 * 처음에는 이 저장소의 다른 스캐너들처럼 여는 태그를 중괄호 깊이로 끊었다.
 * **그 파서가 원소 수십 개를 통째로 한 태그로 삼켰다** — `AtlasGitPanel` 하나가
 * 잉크 40여 개를 진 「태그」로 보고됐고, 전부 오탐이었다. 원인은 두 갈래다:
 * 코드 안의 비교 연산(`a < b`)이 태그 시작으로 잡히면 파서가 파일 끝까지
 * 훑고, 애초에 그 파일의 브랜드 면은 **JSX 태그가 아니라 파일 상수**
 * (`const X = \`… bg-…-brand … text-on-accent …\``)에 살아서 태그 단위로는
 * 원리적으로 안 잡힌다.
 *
 * className 은 결국 **문자열 리터럴**이고, 리터럴은 다른 원소를 삼킬 수 없다.
 * 그래서 판정 단위를 리터럴로 내린다 — 인라인 className 도, `cn()` 의 인자도,
 * 상수로 뺀 것도 같은 단위가 된다.
 *
 * 대가는 하나다: 면과 잉크가 **서로 다른 리터럴**로 갈린 짝은 못 본다(조건부
 * className). 그래서 아래에 「면만 있고 잉크가 없는 리터럴」 수를 함께 세고,
 * 그 수가 늘면 이 사각이 커졌다는 신호로 읽는다.
 */
describe("브랜드 면 × 잉크 페어링 — 소스 전수", () => {
  const FILL_RE = /bg-\[color:var\(--color-indigo-brand(?:-hover)?\)\]/;
  const INK_RE = /text-\[color:var\(--color-([a-z0-9-]+)\)\]/g;

  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "node_modules" || name === ".next") continue;
        walk(p, acc);
      } else if (/\.tsx$|\.ts$/.test(name) && !/\.test\./.test(name)) acc.push(p);
    }
    return acc;
  };

  /**
   * 따옴표 셋 모두의 문자열 리터럴.
   *
   * ⚠️ 템플릿 리터럴의 백틱 짝짓기는 `${…}` 안에 또 문자열이 들어가면
   * 어긋난다 — 실측: `AtlasGitPanel` 에서 5,198자짜리 「리터럴」이 나와
   * 원소 여럿의 잉크를 한 자리에 몰아넣었다(오탐 7건). className 리터럴에는
   * **JSX 가 들어 있을 수 없다**는 성질로 그 인공물을 버린다. 길이로 자르지
   * 않는 이유는 정당한 상수도 400자를 넘기 때문이다(같은 파일 193줄).
   */
  const JSX_INSIDE = /<[A-Za-z/]/;
  const literals = (src: string): string[] =>
    [...src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
      .filter((s) => !JSX_INSIDE.test(s));

  /** 이 리터럴이 지는 잉크 중 라이선스를 못 넘는 것. 잉크가 없으면 빈 배열. */
  const unlicensedInks = (literal: string): string[] => {
    if (!FILL_RE.test(literal)) return [];
    const fill = /brand-hover/.test(literal)
      ? SOLID_FILLS["indigo-brand-hover"]
      : SOLID_FILLS["indigo-brand"];
    const bad: string[] = [];
    for (const m of literal.matchAll(INK_RE)) {
      let ink: Rgba;
      try {
        ink = cssToken(`--color-${m[1]}`);
      } catch {
        continue; // globals.css 에 없는 이름은 다른 게이트의 일이다
      }
      const r = ratioOn(ink, fill);
      if (r < AA) bad.push(`--color-${m[1]} (${r.toFixed(2)}:1)`);
    }
    return bad;
  };

  const scan = () => {
    const offenders: string[] = [];
    let fillsSeen = 0;
    let inklessFills = 0;
    for (const file of [join(ROOT, "src"), join(ROOT, "app")].flatMap((d) => walk(d))) {
      const src = readFileSync(file, "utf8");
      if (!FILL_RE.test(src)) continue;
      for (const literal of literals(src)) {
        if (!FILL_RE.test(literal)) continue;
        fillsSeen += 1;
        if (!INK_RE.test(literal)) inklessFills += 1;
        INK_RE.lastIndex = 0;
        const bad = unlicensedInks(literal);
        if (bad.length) offenders.push(`${file.replace(ROOT, ".")}: ${bad.join(" · ")}`);
      }
    }
    return { offenders, fillsSeen, inklessFills };
  };

  it("탐지기가 실제로 브랜드 면을 보고 있다 — 전집합이 비어 있지 않다", () => {
    const { fillsSeen } = scan();
    expect(fillsSeen, "브랜드 면을 하나도 못 찾았다 — 정규식이 램프와 어긋났다").toBeGreaterThan(10);
  });

  it("위반 0 — 브랜드 면을 진 잉크는 AA 를 넘는다", () => {
    const { offenders } = scan();
    expect(
      offenders,
      "꽉 찬 인디고 면 위의 글자가 AA(4.5:1)에 못 미친다.\n" +
        "처방은 `--color-text-on-accent`(#ffffff, 4.70:1) 다 — 이미 이 저장소의 버튼\n" +
        "프리미티브와 값 층이 쓰는 그 토큰이다.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("사각이 커지지 않는다 — 잉크 없는 브랜드 면 리터럴의 상한", () => {
    /*
     * 이 게이트의 유일한 사각은 「면과 잉크가 서로 다른 리터럴로 갈린 짝」이다.
     * 그 수를 직접 셀 수는 없지만, **잉크 없는 면 리터럴** 수가 그것의 상계다.
     * 2026-08-15 에 24건을 전수로 열어 확인했고 전부 정당했다:
     *
     * | 갈래 | 건수 | 왜 정당한가 |
     * |---|---:|---|
     * | 호버 면(`hover:bg-…-brand-hover`) | **1** | ⚠️ 2026-08-15 (11) 에 8 → 1 이 됐다. 그 규칙(**채워진 버튼만 어두워진다**)이 값 층의 `onAccent` **톤 정의로 내려가서**, 소비처 7곳이 같은 문자열을 손으로 쓰던 것이 사라졌다. 남은 1은 톤을 손으로 재조립한 상수(`AtlasGitPanel`)다 |
     * | 점·1px 레일·밑줄 | 13 | 글자가 없다. §1.4.3 의 대상이 아니다 |
     * | 조건부 면 가지 3곳(GuidedTourCard 점 · ProjectDrawer 레일 · SearchPalette 레일) | 3 | 전부 `aria-hidden` 인 글자 없는 표식 |
     *
     * 이 수가 늘면 그중 하나가 「잉크를 다른 리터럴에 둔 진짜 짝」일 수 있다.
     * 그때는 상한을 올리기 전에 그 자리를 열어 봐야 한다.
     */
    /*
     * **2026-08-18: 17 → 20.** 세 자리를 다 열어 확인했다 — 전부 `aria-hidden`
     * 이고 글자가 없다(§1.4.3 의 대상이 아니다): 악센트 팔레트 피커의 미리보기
     * 점 1, 관문 리메이크의 히어로 아이브로우·절 머리 정적 악센트 점 2.
     * (같은 날 악센트가 인디고로 되돌아왔지만 이 수는 색과 무관하다 — 세는
     * 것은 «브랜드 면 리터럴의 자리 수»이지 그 면의 색이 아니다.)
     */
    /*
     * **2026-08-20: 20 → 21.** 한 자리를 열어 확인했다 — 에이전트 도구 설치
     * 진행 막대의 채워지는 부분(`AgentDoctor.tsx`). 그 `<span>` 은 `aria-hidden`
     * 인 트랙 안에 있고 **자식이 없다**(너비만 인라인 스타일로 받는다). 진행률
     * 숫자는 막대 **위**가 아니라 그 위 문단에 무채색 잉크로 따로 있다 —
     * 브랜드 면 위에 글자를 얹은 것이 아니다.
     */
    const { inklessFills } = scan();
    expect(inklessFills, "잉크 없는 브랜드 면 리터럴이 늘었다 — 각 자리가 정말 글자 없는 면인지 확인하라").toBeLessThanOrEqual(15);
  });

  it("사각이 줄었으면 상한도 내린다 — 여유를 무료로 두지 않는다", () => {
    /*
     * 「체계」석 권고(2026-08-15): 점 하나가 지워져 사각이 줄었는데 상한이 그대로
     * 남으면, 그 여유가 다음에 들어오는 **진짜 짝**의 무료 통행증이 된다.
     * `accent-ink-contrast` 의 「갚았으면 기준선도 내린다」와 같은 문법이다.
     */
    const { inklessFills } = scan();
    expect(
      inklessFills,
      "잉크 없는 브랜드 면 리터럴이 줄었다 — 위 상한 15 도 같이 내려라.",
    ).toBeGreaterThanOrEqual(15);
  });

  it("탐지기가 심은 위반을 잡고 정상 짝은 놓아준다", () => {
    const bad = `rounded-full bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-primary)]`;
    const good = `rounded-full bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-on-accent)]`;
    const inkless = `h-1 w-1 rounded-full bg-[color:var(--color-indigo-brand)]`;
    const tint = `bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]`;
    const hover = `bg-[color:var(--color-indigo-brand-hover)] text-[color:var(--color-text-tertiary)]`;

    expect(unlicensedInks(bad), "심은 위반을 못 잡는다").toHaveLength(1);
    expect(unlicensedInks(good), "고친 짝을 위반으로 센다").toEqual([]);
    expect(unlicensedInks(inkless), "글자 없는 면은 이 계약 밖이다").toEqual([]);
    expect(unlicensedInks(tint), "틴트는 accent-ink-contrast 의 관할이다").toEqual([]);
    expect(
      unlicensedInks(hover),
      "호버 면도 같은 라이선스를 진다 — 대비는 상태를 가리지 않는다",
    ).toHaveLength(1);
  });

  it("리터럴 단위가 상수로 뺀 className 도 본다 — 태그 파서가 원리적으로 못 보던 층", () => {
    const src = readFileSync(join(ROOT, "src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx"), "utf8");
    const withFill = literals(src).filter((l) => FILL_RE.test(l));
    expect(withFill.length, "상수 className 의 브랜드 면을 못 찾았다").toBeGreaterThan(0);
    expect(withFill.some((l) => /text-on-accent/.test(l)), "그 상수의 잉크를 못 읽는다").toBe(true);
  });
});
