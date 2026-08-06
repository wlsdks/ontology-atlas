import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 네이티브 체크박스/라디오의 **타깃 크기** 계약 (WCAG 2.5.8 AA — 24×24).
 *
 * ## 왜 이 게이트가 필요한가 — 두 검사가 나란히 이것을 못 봤다
 *
 * 2026-08-05 전수: 네이티브 체크박스 **5곳이 전부 24px 미만**이었다
 * (`h-4`=16 · `h-3.5`=14 · `size-3.5`=14 ×2 · **크기 클래스 자체가 없음** 1).
 * 그런데 이 저장소의 게이트 어느 것도 빨개지지 않았다:
 *
 * | 게이트 | 왜 못 봤나 |
 * |---|---|
 * | `control-adoption-ratchet` | 세는 태그가 `button` · `Link` · `a` 뿐이다 |
 * | `touch-target-contract.spec.ts` | 셀렉터 네 개가 전부 `button, a[href]` 다 |
 *
 * **둘 다 「손으로 쓴 컨트롤」을 지키는 검사인데 폼이 시야 밖이었다.** 그래서
 * 폼은 무제한으로 늘 수 있었고, 실제로 늘었다.
 *
 * ## 판정식은 WCAG 를 그대로 옮긴 것이다
 *
 * 타깃은 「아이콘이 몇 px 인가」가 아니라 **「무엇이 클릭을 받나」**다
 * (SC 2.5.5 Understanding). 체크박스를 `<label>` 이 감싸면 라벨 클릭이 곧
 * 토글이라는 **네이티브 동작** 때문에 라벨 전체가 하나의 타깃이 된다. 그래서
 * 통과 조건이 둘이다:
 *
 * 1. 체크박스 자신이 24px 이상이거나
 * 2. **감싸는 `<label>` 이 24px 바닥을 갖거나**
 *
 * 오늘 다섯 곳 전부 2번을 골랐다 — 14px 체크박스를 24px 로 키우면 11px 라벨
 * 글자보다 커져서 「눌리는 것이 라벨보다 작아지는」 위계 뒤집힘의 반대가 난다.
 * 대신 라벨에 `min-h-6`(24, AA)와 `atlas-touch-floor`(coarse 44, AAA 쪽)를
 * 함께 얹었다.
 *
 * ## 이 검사가 못 하는 것 — 그래서 e2e 가 따로 있다
 *
 * 소스만 보므로 **실제로 그려진 rect** 는 모른다. 라벨이 24px 바닥을 갖고도
 * 부모가 `overflow-hidden` 으로 잘라 버리면 이 검사는 초록이고 화면은 미달이다.
 * 그 층은 `tests/e2e/touch-target-contract.spec.ts` 의 몫이다. 이 계약은
 * **원인**(바닥이 코드에 있는가)을, e2e 는 **결과**(화면에서 24인가)를 본다.
 */

const ROOT = join(__dirname, '..', '..');
const ROOTS = [join(ROOT, 'src'), join(ROOT, 'app')];

/** Tailwind 의 `size-N`/`h-N` 은 0.25rem 단위다 — 24px 은 `6`. */
const AA_MIN_PX = 24;
const TAILWIND_STEP_PX = 4;

/** 라벨이 바닥을 갖고 있음을 나타내는 표식. `.atlas-touch-floor` 는 coarse 전용이라 AA 를 혼자 못 낸다. */
const AA_FLOOR_CLASS = /\bmin-h-(\d+(?:\.\d+)?)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (/\.test\.|\.spec\./.test(name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * 주석을 걷어낸다. **이 저장소가 2026-08 에만 네 번 밟은 결함이다** — 주석 안의
 * 예시 코드를 위반으로 세거나(과다), 주석에 가려진 진짜 위반을 놓친다(과소).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** `size-6` · `h-6` · `size-[24px]` 등에서 px 를 읽는다. 못 읽으면 null. */
function declaredPx(className: string): number | null {
  const bracket = className.match(/\b(?:size|h)-\[(\d+(?:\.\d+)?)px\]/);
  if (bracket) return Number(bracket[1]);
  const step = className.match(/\b(?:size|h)-(\d+(?:\.\d+)?)\b/);
  if (step) return Number(step[1]) * TAILWIND_STEP_PX;
  return null;
}

type Site = {
  file: string;
  type: string;
  className: string;
  ownPx: number | null;
  labelFloorPx: number | null;
  hasCoarseFloor: boolean;
};

/**
 * 체크박스/라디오를 찾고, **그것을 감싸는 가장 가까운 `<label>` 의 여는 태그**를
 * 되짚어 그 바닥을 읽는다.
 *
 * 여는 태그를 뒤로 훑는 이유: JSX 를 파싱하지 않고도 «이 input 이 label 안에
 * 있는가»를 판정하려면 앞쪽에서 가장 가까운 `<label` 과 그 사이에 `</label>` 이
 * 끼어 있지 않은지를 보면 된다.
 */
/**
 * `<input` 부터 그 태그가 **정말로 끝나는 곳**까지 잘라 낸다.
 *
 * ⚠️ **`[^>]*` 로 하면 안 된다 — 처음에 그렇게 썼다가 다섯 곳을 전부 오탐했다.**
 * JSX 의 핸들러가 화살표 함수(`onChange={(e) => …}`)라 그 `>` 에서 잘리고,
 * 그 뒤에 오는 `className` 에 아예 닿지 못한다. 그러면 「크기 클래스가 없다」는
 * 판정이 나오는데, 실제 코드에는 멀쩡히 있다.
 *
 * 중괄호 깊이를 세면서 **깊이 0 에서 나오는 `>`** 만 태그의 끝으로 친다.
 */
function inputTagAt(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

function collect(files: string[]): Site[] {
  const sites: Site[] = [];
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const m of source.matchAll(/<input\b/g)) {
      const tag = inputTagAt(source, m.index ?? 0);
      const typeMatch = tag.match(/type=["'](checkbox|radio)["']/);
      if (!typeMatch) continue;
      const className = tag.match(/className=["']([^"']*)["']/)?.[1] ?? '';

      const before = source.slice(0, m.index ?? 0);
      const labelOpen = before.lastIndexOf('<label');
      const labelClose = before.lastIndexOf('</label>');
      const wrapped = labelOpen !== -1 && labelOpen > labelClose;
      let labelFloorPx: number | null = null;
      let hasCoarseFloor = false;
      if (wrapped) {
        const labelTag = source.slice(labelOpen, source.indexOf('>', labelOpen) + 1);
        /*
         * 바닥은 두 갈래로 온다 — 리터럴(`min-h-6 atlas-touch-floor`)이거나,
         * **값 층**(`fieldLabel({ row: true })`)이거나. 후자를 모르면 규격을
         * 값 층으로 옮긴 순간 이 게이트가 **진전을 벌한다** — 오늘 두 번 밟은
         * 그 실패다. `fieldLabel` 의 `row` 가 무엇을 내는지는 그 자신의 계약이
         * 지킨다(`field-class.contract.test.ts`).
         */
        const viaValueLayer = /fieldLabel\s*\(\s*\{[^}]*\brow:\s*true/.test(labelTag);
        const floor = labelTag.match(AA_FLOOR_CLASS);
        labelFloorPx = viaValueLayer ? AA_MIN_PX : floor ? Number(floor[1]) * TAILWIND_STEP_PX : null;
        hasCoarseFloor = viaValueLayer || labelTag.includes('atlas-touch-floor');
      }
      sites.push({
        file: file.slice(ROOT.length + 1),
        type: typeMatch[1],
        className,
        ownPx: declaredPx(className),
        labelFloorPx,
        hasCoarseFloor,
      });
    }
  }
  return sites;
}

const sites = collect(ROOTS.flatMap(walk));

describe('네이티브 체크박스·라디오의 타깃 크기 (WCAG 2.5.8 AA)', () => {
  /**
   * 공회전 방지. 이 저장소는 「깨끗해서 0」과 「안 봐서 0」을 구별 못 하는 게이트를
   * 반복해서 만들었다 — 스캐너가 조용해지면 이 단언이 먼저 빨개진다.
   */
  it('탐지기가 실제로 체크박스를 찾고 있다 — 0건이면 스캐너가 죽은 것이다', () => {
    expect(
      sites.length,
      '네이티브 체크박스를 한 건도 못 찾았다. 스캐너가 죽었거나 표기가 바뀌었다.',
    ).toBeGreaterThanOrEqual(5);
  });

  it.each(sites.map((s) => [`${s.file} (${s.type})`, s] as const))(
    '%s — 자기 24px 이거나 감싸는 라벨이 24px 바닥을 갖는다',
    (_name, site) => {
      const ownOk = site.ownPx !== null && site.ownPx >= AA_MIN_PX;
      const labelOk = site.labelFloorPx !== null && site.labelFloorPx >= AA_MIN_PX;
      expect(
        ownOk || labelOk,
        `자기 크기 ${site.ownPx ?? '미지정'}px · 라벨 바닥 ${site.labelFloorPx ?? '없음'}px. ` +
          '체크박스를 24px 로 키우거나, 감싸는 <label> 에 `min-h-6` 을 얹어라 ' +
          '(라벨 클릭이 곧 토글이라 라벨 전체가 하나의 타깃이다).',
      ).toBe(true);
    },
  );

  /**
   * 크기 클래스가 아예 없으면 브라우저 기본값(Chromium macOS ≈13px)이 그려진다.
   * **코드에 아무 값도 안 남으므로 값을 보는 어떤 lint 도 볼 수 없다** — 이
   * 저장소가 여러 번 밟은 「아예 만들어지지 않은 것은 코드에 흔적이 없다」의
   * 폼 판이다. 실제로 `AtlasGitPanel` 의 push opt-in 이 그 상태였다.
   */
  it.each(sites.map((s) => [s.file, s] as const))(
    '%s — 크기를 UA 기본값에 맡기지 않는다',
    (_file, site) => {
      expect(
        site.ownPx,
        '크기 클래스가 없다. 브라우저마다 다른 값이 그려지고, 값이 코드에 안 남아 lint 도 못 본다.',
      ).not.toBeNull();
    },
  );

  it('손가락에서도 바닥이 있다 — 라벨로 타깃을 낸 자리는 coarse 44 도 함께 받는다', () => {
    const labelTargeted = sites.filter((s) => !(s.ownPx !== null && s.ownPx >= AA_MIN_PX));
    expect(labelTargeted.length, '라벨로 타깃을 내는 자리가 없다면 이 단언은 헛돈다').toBeGreaterThan(0);
    const missing = labelTargeted.filter((s) => !s.hasCoarseFloor);
    expect(
      missing.map((s) => s.file),
      'AA 24 는 마우스 기준이다. 손가락(coarse)에서는 `atlas-touch-floor` 가 44 를 낸다.',
    ).toEqual([]);
  });

  /**
   * 시각 크기가 흩어지지 않게 잠근다. 고치기 전 다섯 곳은 16 · 14 · 14 · 14 ·
   * UA기본 이었다 — 같은 부품이 자리마다 다른 값을 갖는 것이 이 저장소가
   * 「고유 조합 50종」으로 부르는 그 결함이다.
   */
  it('체크박스 시각 크기가 한 값으로 모인다', () => {
    const sizes = [...new Set(sites.map((s) => s.ownPx))].sort();
    expect(sizes.length, `체크박스 크기가 ${sizes.join(' · ')} 로 갈렸다`).toBe(1);
  });
});
