
import { describe, it, expect } from 'vitest';
import { cn, LEADING_RAMP_STEPS, RADIUS_RAMP_STEPS, TYPE_RAMP_STEPS } from './cn';
import { readGlobalCss } from '../../../scripts/lib/global-css.mjs';

/**
 * Ramp steps are derived from `app/globals.css`, not a hardcoded list, so a new step is in scope the
 * moment it exists.
 */
function rampStepsFromCss(prefix: 'text' | 'leading' | 'radius'): string[] {
  const css = readGlobalCss();
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
 * A custom ramp step classified as a colour conflicts with `text-[color:...]` and the size is
 * dropped silently.
 */
describe('cn — 타입 램프와 색상 유틸 공존', () => {
  it('**등록 목록이 램프와 일치한다** — 누락은 조용한 크기 드롭이 된다', () => {
    // Add a step to `globals.css` without registering it here and
    // tailwind-merge misclassifies it as a colour, dropping the size against a
    // following `text-[color:…]`. The class string still looks correct.
    expect([...TYPE_RAMP_STEPS].sort()).toEqual(rampStepsFromCss('text'));
  });

  it('램프를 실제로 읽는다 — 스캔이 비면 통과가 아니라 결함이다', () => {
    // If the path or the regex drifts, the comparison above passes as
    // `[] === []`. An empty scan is a failure, not a pass.
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
 * Different failure mode from the type ramp: an unregistered `leading-*` step is
 * not dropped, both survive, and CSS source order decides — a conditional
 * override losing non-deterministically. Quieter than a dropped size, and not
 * diagnosable by looking at the screen.
 */
describe('cn — 행간 램프 충돌 병합', () => {
  it('**등록 목록이 램프와 일치한다** — 누락은 충돌 병합 실패가 된다', () => {
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

  /*
   * These use named leading utilities that lint forbids: `cn` must still merge correctly if one
   * arrives from third-party code or an old string. Test files are exempt from that lint rule
   * (`codexTestIgnores`).
   */
  it('기존 named 행간 유틸리티와의 병합도 유지된다', () => {
    expect(cn('leading-4', 'leading-label')).toBe('leading-label');
    expect(cn('leading-prose', 'leading-relaxed')).toBe('leading-relaxed');
  });

  it('크기와 행간은 서로를 밀어내지 않는다 (다른 그룹)', () => {
    expect(cn('text-body', 'leading-body')).toBe('text-body leading-body');
  });
});

describe('cn — 반경 램프 충돌 병합', () => {
  it('**등록 목록이 램프와 일치한다** — 누락은 충돌 병합 실패가 된다', () => {
    expect([...RADIUS_RAMP_STEPS].sort()).toEqual(rampStepsFromCss('radius'));
  });

  it('램프를 실제로 읽는다 — 스캔이 비면 통과가 아니라 결함이다', () => {
    expect(rampStepsFromCss('radius').length).toBeGreaterThanOrEqual(4);
  });

  it.each([
    ['rounded-chip', 'rounded-micro'],
    ['rounded-micro', 'rounded-chip'],
    ['rounded-card', 'rounded-panel'],
  ])('%s 뒤에 %s 가 오면 뒤가 이긴다', (first, second) => {
    expect(cn(first, second)).toBe(second);
  });

  it('기본 스케일 유틸리티와도 한 그룹으로 병합된다', () => {
    // The idiomatic override — a consumer forcing a pill with `rounded-full` —
    // has to actually win.
    expect(cn('rounded-chip', 'rounded-full')).toBe('rounded-full');
    expect(cn('rounded-full', 'rounded-micro')).toBe('rounded-micro');
  });
});

/**
 * tailwind-merge assumes a size utility also sets line-height, so a **later**
 * `text-<step>` erases an earlier `leading-*`. Before the companion pairing that
 * assumption was false for our ramp: nothing refilled the erased value and the
 * element fell back to an inherited 1.5 — a silent loss. With companions, the
 * utility that erases carries its own pair, making the assumption true. Reverting
 * the companions breaks here first.
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
