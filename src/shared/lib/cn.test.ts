import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';
import { cn, LEADING_RAMP_STEPS, RADIUS_RAMP_STEPS, TYPE_RAMP_STEPS } from './cn';

/**
 * Reads the ramp steps actually declared in `app/globals.css`.
 *
 * **Why not a hardcoded list.** This gate is named by `cn.ts` and by
 * `.claude/rules/design.md`, yet until the 2026-07-31 audit it held seven
 * hand-written steps — and `hero-lg` had been added to the ramp without being
 * added here. The exact accident this gate claims to prevent (2026-07-23: a step
 * added, its registration missed, chrome rendering at 16px) had already happened
 * inside the gate itself.
 *
 * A hardcoded list only checks what it already lists. Derived from the ramp, a
 * new step is in scope the moment it exists and a missing registration fails
 * here first. `--text-body--line-height` companions are pairs, not steps.
 */
function rampStepsFromCss(prefix: 'text' | 'leading' | 'radius'): string[] {
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
 * Regression gate for the 2026-07-23 owner report: a custom ramp step classified
 * as a colour conflicts with `text-[color:…]` and the size is dropped silently —
 * why chrome pills were rendering at the root 16px.
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
   * These deliberately use the named utilities that lint forbade on 2026-08-17
   * (closed with zero product usage, so no noise). The point here is that `cn`
   * still merges correctly *if* a forbidden one arrives — from third-party code
   * or an old string. Deleting the test because the rule exists would remove the
   * last line of defence against sizes and line-heights blending silently.
   *
   * The file-level exemption matches the sibling ramp rules (size, weight,
   * tracking): tests assert rendered className strings (`codexTestIgnores`).
   */
  it('기존 named 행간 유틸리티와의 병합도 유지된다', () => {
    expect(cn('leading-4', 'leading-label')).toBe('leading-label');
    expect(cn('leading-prose', 'leading-relaxed')).toBe('leading-relaxed');
  });

  it('크기와 행간은 서로를 밀어내지 않는다 (다른 그룹)', () => {
    expect(cn('text-body', 'leading-body')).toBe('text-body leading-body');
  });
});

/**
 * Same failure mode as the leading ramp, for radii (`--radius-micro`, added
 * 2026-08-03). It became a live path when the value layer started compounding a
 * size radius over a shape's base radius at chip/xs.
 */
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
