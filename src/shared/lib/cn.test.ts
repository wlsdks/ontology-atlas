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
