import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { controlClass } from '../../src/shared/ui/control-class';

/** 주석은 값이 아니다 — 이 라운드에서 네 번 밟은 함정. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 여는 태그를 중괄호 깊이로 끊는다 — 다행 태그와 콜백을 넘긴다. */
function openingTag(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from, from + 3000);
}

function collectTsx(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
        continue;
      }
      if (!/\.tsx$/.test(name) || name.includes('.test.')) continue;
      out.push(p);
    }
  };
  for (const root of ['src', 'app']) walk(path.join(process.cwd(), root));
  return out;
}

/**
 * **키보드 초점 링은 값 층이 낸다** — 그리고 그것을 단언하는 게이트가 없었다.
 *
 * ## 왜 이 파일이 존재하나 (2026-08-05 감사)
 *
 * 저장소 전체에서 초점 링을 언급하는 테스트는 셋뿐이었고 **어느 것도 「링이
 * 있는가」를 묻지 않았다**:
 *
 * - `prose-link.contract.test.ts` — 글 속 링크는 초점을 **선언하지 않는다**를 단언(반대 방향)
 * - `agent-client-buttons-use-shared-button.contract.test.ts` — 한 파일이 `<Button>` 을 쓰는지
 * - `tests/e2e/dialog-focus-ring.spec.ts` — 시트 **컨테이너 하나**가 `outline: auto` 가 아닌지
 *
 * 그 사이에서 `controlClass` 와 `controls.tsx` 는 `focus` 라는 글자를 **0회**
 * 갖고 있었다. `Chip` 52 · `IconButton` 35 · `RowButton` 19 — 106개 컨트롤이
 * 키보드 초점에서 **OS 강조색**을 그렸다. axe 에는 focus-visible 룰이 없어
 * `a11y-ratchet` 도 못 잡는다.
 *
 * **왜 e2e 가 아니라 계약인가**: 초점 링은 실제로 탭을 눌러야 보이므로 DOM
 * 스윕(쉬는 상태)으로는 원리적으로 안 보인다. 그런데 값 층이 문자열을 내는
 * 구조라 **조합 결과를 여기서 직접 만들어 볼 수 있다** — `control-class`
 * 계약이 여덟 모양 × 세 크기 × 아홉 톤을 전부 조립해 보는 것과 같은 방법이고,
 * 브라우저 없이 도는 만큼 모든 PR 에서 돈다.
 */

const ROOT = process.cwd();
const RING = 'focus-visible:ring-';
const OUTLINE_OFF = 'focus-visible:outline-none';

const SHAPES = ['chip', 'icon', 'row', 'link', 'pill', 'card'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;

describe('키보드 초점 링 — 값 층이 낸다', () => {
  it('모든 모양 × 크기 조합이 초점 링을 싣는다', () => {
    const missing: string[] = [];
    for (const shape of SHAPES) {
      for (const size of SIZES) {
        let out = '';
        try {
          out = controlClass({ shape, size } as Parameters<typeof controlClass>[0]);
        } catch {
          continue; // 그 조합이 없으면 이 계약의 대상이 아니다
        }
        if (!out.includes(RING) || !out.includes(OUTLINE_OFF)) missing.push(`${shape}/${size}`);
      }
    }
    expect(
      missing,
      '값 층이 초점 링을 안 내면 브라우저 기본(OS 강조색)이 그려진다 — 헌장의\n' +
        '「무채색 + 인디고 하나」 밖이다. `control-class.ts` 의 FOCUS 상수를 확인하라.\n' +
        `누락: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('초점 링 색이 인디고 계보다 — 다른 색이 새로 들어오지 않는다', () => {
    const out = controlClass({ shape: 'chip', size: 'md' });
    const ring = /focus-visible:ring-\[color:var\((--[a-z0-9-]+)\)\]/.exec(out);
    expect(ring, '초점 링이 토큰을 참조하지 않는다').not.toBeNull();
    expect(
      ring![1],
      `초점 링은 인디고 계보여야 한다 — 지금 ${ring![1]}`,
    ).toMatch(/indigo/);
  });

  it('링은 inset 이다 — 촘촘한 행에서 이웃과 겹치지 않고 상자 치수를 안 바꾼다', () => {
    expect(controlClass({ shape: 'row', size: 'md' })).toContain('focus-visible:ring-inset');
  });

  /**
   * 값 층이 내더라도 **소비처가 `className` 으로 덮어쓰면** 무의미하다.
   * `outline-none` 으로 브라우저 기본 링을 끄고 **아무 대체 표시도 안 주면**
   * 초점이 완전히 안 보인다(WCAG 2.4.7).
   *
   * ## 이 판정이 두 번 좁았다 — 첫 구현은 4건 전부 오탐이었다
   *
   * 초판은 「`outline-none` 이 있으면 같은 **파일**에 `ring-` 도 있어야 한다」
   * 였고, 실측 4건이 전부 정당했다:
   *
   * 1. **링이 유일한 초점 표시가 아니다** — `focus-visible:border-*` 로 테두리
   *    색을 바꾸는 것도 보이는 초점이다(2건).
   * 2. **프로그램으로 옮긴 초점은 링을 일부러 지운다** — `tabIndex={-1}` 인
   *    모달·패널 컨테이너는 «알리는 용도»의 초점이라 링이 오히려 결함이다.
   *    실제로 2026-08-04 감사가 첫 실행 시트에서 그 링을 **지우라고** 판정했고
   *    `tests/e2e/dialog-focus-ring.spec.ts` 가 그것을 지킨다(2건).
   *
   * 그래서 판정을 **파일 단위 → 여는 태그 단위**로 좁히고, 대체 표시의 범위를
   * 넓히고, `tabIndex={-1}` 를 면제한다. 게이트를 새로 만들 때 자기 오탐부터
   * 재는 것이 이 저장소의 규율이다(`design-gates.md` 「룰을 켜기 전 반드시
   * 측정한다」).
   */
  it('초점을 끄기만 하고 아무 표시도 안 주는 자리가 없다', () => {
    const files = collectTsx();
    expect(files.length, '스캔이 비었다 — 공집합 위의 게이트는 게이트가 아니다').toBeGreaterThan(150);

    /** 링 말고도 정당한 초점 표시 — 테두리·바탕·그림자 변화. */
    const ANY_INDICATOR = /focus-visible:(ring-|border-|bg-|shadow-|text-)/;
    const offenders: string[] = [];
    let scannedTags = 0;

    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/<[a-zA-Z][a-zA-Z0-9.]*\b/g)) {
        const tag = openingTag(src, m.index ?? 0);
        if (!tag.includes(OUTLINE_OFF)) continue;
        scannedTags += 1;
        // 프로그램으로 옮기는 초점(모달·패널 컨테이너)은 링이 결함이다
        if (/tabIndex=\{-1\}/.test(tag)) continue;
        if (ANY_INDICATOR.test(tag)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${path.relative(ROOT, f)}:${line}`);
      }
    }

    expect(scannedTags, '`outline-none` 을 쓰는 태그를 한 개도 못 찾았다 — 탐지기가 죽었다').toBeGreaterThan(50);
    expect(
      offenders,
      '`focus-visible:outline-none` 은 브라우저 기본 링을 **끄기만** 한다. 대체 표시\n' +
        '(ring · border · bg · shadow 중 하나)가 없으면 초점이 아예 안 보인다(WCAG 2.4.7).\n' +
        `위반: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('프로브 — 탐지기가 실제로 먹는다', () => {
    const scan = (body: string): string[] => {
      const src = stripComments(body);
      const out: string[] = [];
      for (const m of src.matchAll(/<[a-zA-Z][a-zA-Z0-9.]*\b/g)) {
        const tag = openingTag(src, m.index ?? 0);
        if (!tag.includes(OUTLINE_OFF)) continue;
        if (/tabIndex=\{-1\}/.test(tag)) continue;
        if (/focus-visible:(ring-|border-|bg-|shadow-|text-)/.test(tag)) continue;
        out.push('hit');
      }
      return out;
    };
    // 위반 — 끄기만 했다
    expect(scan('<button className="focus-visible:outline-none" />')).toHaveLength(1);
    // 정상 — 링 · 테두리 · 프로그램 컨테이너
    expect(scan('<button className="focus-visible:outline-none focus-visible:ring-2" />')).toEqual([]);
    expect(scan('<input className="focus-visible:outline-none focus-visible:border-x" />')).toEqual([]);
    expect(scan('<div tabIndex={-1} className="focus-visible:outline-none" />')).toEqual([]);
    // 주석 속 인용은 값이 아니다
    expect(scan('// <button className="focus-visible:outline-none" />\nconst a = 1;')).toEqual([]);
  });
});
