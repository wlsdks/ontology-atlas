import { describe, it, expect } from 'vitest';
import { cn } from './cn';

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
  it.each(['caption', 'label', 'body', 'body-lg', 'title', 'display', 'hero'])(
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
