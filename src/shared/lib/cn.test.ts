import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';
import { cn, LEADING_RAMP_STEPS, TYPE_RAMP_STEPS } from './cn';

/**
 * `app/globals.css` 에 실제로 선언된 램프 스텝을 읽는다.
 *
 * **왜 하드코딩하지 않는가** — 이 파일은 `cn.ts` 주석과 `.claude/rules/design.md`
 * 가 **이름으로 지목한 가드**다. 그런데 2026-07-31 감사 전까지 스텝 7개를
 * 손으로 적어 두고 있었고, 그 사이 `hero-lg` 가 램프에 추가됐는데 목록에는 안
 * 들어갔다 — **가드가 지킨다고 적힌 바로 그 사고(2026-07-23 크롬 16px: 스텝
 * 추가 후 등록 누락)가 이 파일 안에서 이미 일어나 있었다.**
 *
 * 하드코딩 목록은 "검사한 것만 검사한다". 램프에서 파생하면 스텝을 더하는
 * 순간 자동으로 검사 대상이 되고, 등록을 빠뜨리면 **여기서 먼저 터진다.**
 * `--text-body--line-height` 류 companion 은 스텝이 아니라 짝이라 제외한다.
 */
function rampStepsFromCss(prefix: 'text' | 'leading'): string[] {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  const found = new Set<string>();
  const re = new RegExp(`^\\s*--${prefix}-([a-z0-9-]+):`, 'gm');
  for (const m of css.matchAll(re)) {
    const step = m[1];
    if (step.endsWith('--line-height')) continue;
    found.add(step);
  }
  return [...found].sort();
}

describe('cn', () => {
  it('joins string classes', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('skips falsy values', () => {
    expect(cn('a', false, 'b', null, undefined, 'c')).toBe('a b c');
  });

  it('merges conflicting tailwind utilities (later wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles conditional object form', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });
});

/**
 * 타입 램프 × tailwind-merge 오분류 회귀 가드 (2026-07-23 소유자 실보고).
 * 커스텀 램프 스텝이 색상으로 분류되면 `text-[color:...]` 와 충돌해 크기가
 * 조용히 드롭된다 — 크롬 필이 루트 16px 로 렌더되던 근본 원인.
 */
describe('cn — 타입 램프와 색상 유틸 공존', () => {
  it('**등록 목록이 램프와 일치한다** — 누락은 조용한 크기 드롭이 된다', () => {
    // 이 한 줄이 이 파일의 존재 이유다. `globals.css` 에 스텝을 더하고
    // `TYPE_RAMP_STEPS` 등록을 빠뜨리면 tailwind-merge 가 그 스텝을 **색상으로
    // 오분류**해, 뒤따르는 `text-[color:…]` 와 충돌시켜 크기를 지운다. 화면은
    // 루트 16px 로 렌더되고 클래스 문자열은 멀쩡해 보인다.
    expect([...TYPE_RAMP_STEPS].sort()).toEqual(rampStepsFromCss('text'));
  });

  it('램프를 실제로 읽는다 — 스캔이 비면 통과가 아니라 결함이다', () => {
    // globals.css 경로가 바뀌거나 정규식이 어긋나면 위 비교가 `[] === []` 로
    // 조용히 통과할 수 있다. 빈 스캔은 통과가 아니다.
    expect(rampStepsFromCss('text').length).toBeGreaterThanOrEqual(8);
    expect(rampStepsFromCss('leading').length).toBeGreaterThanOrEqual(8);
  });

  it.each([...TYPE_RAMP_STEPS])(
    'text-%s 가 text-[color:...] 뒤에서도 살아남는다',
    (step) => {
      const out = cn(`text-${step}`, 'text-[color:var(--color-text-tertiary)]');
      expect(out).toContain(`text-${step}`);
      expect(out).toContain('text-[color:var(--color-text-tertiary)]');
    },
  );

  it('같은 램프 스텝끼리는 여전히 나중 값이 이긴다', () => {
    expect(cn('text-label', 'text-body')).toBe('text-body');
  });

  it('색상끼리도 나중 값이 이긴다 (기존 동작 보존)', () => {
    expect(cn('text-[color:red]', 'text-[color:blue]')).toBe('text-[color:blue]');
  });
});

/**
 * 행간 램프 × tailwind-merge 병합 가드.
 *
 * 실패 모드가 타입 램프와 다르다. 미등록 `leading-*` 스텝은 드롭되지 않고
 * **둘 다 살아남는다** — 조건부로 덮어쓴 값이 CSS 소스 순서에 따라 지거나
 * 이기는 비결정성이 된다. 크기 드롭보다 조용해서 화면을 봐도 원인을 못 찾는다.
 */
describe('cn — 행간 램프 충돌 병합', () => {
  it('**등록 목록이 램프와 일치한다** — 누락은 충돌 병합 실패가 된다', () => {
    // 실패 모드가 크기와 다르다. 미등록 `leading-*` 은 드롭되지 않고 **둘 다
    // 살아남아** CSS 소스 순서가 승자를 정한다 — 조건부로 덮어쓴 값이 지는
    // 비결정성이라 크기 드롭보다 조용하다.
    expect([...LEADING_RAMP_STEPS].sort()).toEqual(rampStepsFromCss('leading'));
  });

  it.each([
    ['leading-body', 'leading-prose'],
    ['leading-caption', 'leading-label'],
    ['leading-display', 'leading-display-tight'],
    ['leading-title', 'leading-body-lg'],
  ])('%s 뒤에 %s 가 오면 뒤가 이긴다', (first, second) => {
    expect(cn(first, second)).toBe(second);
  });

  it('램프 스텝과 arbitrary 행간이 겹쳐도 나중 값이 이긴다', () => {
    expect(cn('leading-body', 'leading-[1.9]')).toBe('leading-[1.9]');
    expect(cn('leading-[1.9]', 'leading-prose')).toBe('leading-prose');
  });

  it('기존 named 행간 유틸리티와의 병합도 유지된다', () => {
    expect(cn('leading-4', 'leading-label')).toBe('leading-label');
    expect(cn('leading-prose', 'leading-relaxed')).toBe('leading-relaxed');
  });

  it('크기와 행간은 서로를 밀어내지 않는다 (다른 그룹)', () => {
    expect(cn('text-body', 'leading-body')).toBe('text-body leading-body');
  });
});

/**
 * companion 결합(B2) 이후의 병합 모델 가드.
 *
 * tailwind-merge 는 기본적으로 "크기 유틸리티가 행간도 정한다" 고 본다 —
 * 그래서 **뒤에 오는** `text-<스텝>` 이 앞선 `leading-*` 을 지운다. 결합 전엔
 * 이 가정이 우리 램프에 대해 **거짓**이었다: 지워진 자리를 아무도 채우지 않아
 * 그 원소는 상속 1.5 로 떨어졌다(조용한 손실). 결합 후에는 지운 쪽이 자기 짝을
 * 싣고 오므로 가정이 참이 된다.
 *
 * 이 테스트는 그 정합을 고정한다 — companion 을 되돌리면 여기서 먼저 깨진다.
 */
describe('cn — 크기 뒤에 오면 행간을 흡수한다 (companion 결합 전제)', () => {
  it('뒤따르는 램프 크기가 앞선 램프 행간을 흡수한다', () => {
    expect(cn('leading-body', 'text-body')).toBe('text-body');
    expect(cn('leading-prose', 'text-title')).toBe('text-title');
  });

  it('순서를 지키면 명시 행간이 살아남는다 (권장 표기)', () => {
    expect(cn('text-title', 'leading-prose')).toBe('text-title leading-prose');
  });
});
