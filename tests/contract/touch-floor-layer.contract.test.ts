import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { controlClass, fieldClass, type ControlShape, type FieldSize } from '@/shared/ui/control-class';

/**
 * Touch floor (`.atlas-touch-floor`) contract — **is it outside every layer?**
 *
 * ## The defect this gate catches is "a rule exists and does nothing"
 *
 * It happened on 2026-08-05. `controlClass` emits control heights as Tailwind
 * literals (`min-h-6`=24 · `min-h-8`=32 · `min-h-9`=36) and never reads
 * `--control-h-*`, so the token promotion inside `@media (pointer: coarse)`
 * **reached no chip, row, or pill at all**, and 38 places measured under 44px.
 *
 * The floor was then applied through a marker class. The rule was **definitely in
 * the built CSS** (confirmed with `grep touch-floor`), yet the computed
 * `min-height` stayed 32px. The cause was not specificity but **cascade layers**:
 *
 * - Tailwind utilities (`min-h-8`) live in `@layer utilities`
 * - the first version of this rule was inside `@layer base`
 * - **layer order beats specificity** — between two single classes the later layer
 *   always wins, and raising specificity with
 *   `.atlas-touch-floor.atlas-touch-floor` cannot overcome it
 *
 * A rule belonging to no layer **beats every layer** (the CSS cascade). So this
 * rule lives at the end of the file, outside any layer. That is also why it needs
 * no `!important`.
 *
 * ## Why lint cannot catch it
 *
 * `no-restricted-syntax` finds patterns in one file's **syntax tree**, and CSS is
 * out of its range. And what has to be judged here is not a value but the
 * structure: **which block the rule is nested inside.**
 *
 * ## Why e2e alone is not enough
 *
 * `tests/e2e/touch-target-contract.spec.ts` measures the real render and would
 * eventually catch this too, but it covers 3 routes and needs a browser. This
 * contract pins **the cause directly**, so moving the rule back inside a layer
 * turns it red rather than green.
 */

const ROOT = join(__dirname, '..', '..');
const CSS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
const CONTROL_CLASS_SRC = readFileSync(
  join(ROOT, 'src', 'shared', 'ui', 'control-class.ts'),
  'utf8',
);

const FLOOR_CLASS = 'atlas-touch-floor';

/**
 * Finds where the `.atlas-touch-floor` declaration sits by **stacking opening
 * blocks**.
 *
 * Asking a regex whether it "comes after `@layer`" gives no answer — this file has
 * rules that come **after** `@layer base { … }` closes, and nesting up to three
 * deep. Pushing each at-rule name on an opening brace and popping on the closing
 * one yields the exact ancestor list at the declaration.
 */
function ancestorsOfFloorRule(css: string): string[] | null {
  const stack: string[] = [];
  let head = '';
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      const selector = head.trim().split('\n').pop()?.trim() ?? '';
      if (selector.includes(`.${FLOOR_CLASS}`)) return [...stack];
      stack.push(selector);
      head = '';
    } else if (ch === '}') {
      stack.pop();
      head = '';
    } else {
      head += ch;
    }
  }
  return null;
}

describe('손가락 바닥은 캐스케이드 레이어 밖에 산다', () => {
  const ancestors = ancestorsOfFloorRule(CSS);

  it(`\`.${FLOOR_CLASS}\` 규칙이 globals.css 에 실재한다`, () => {
    expect(ancestors, `.${FLOOR_CLASS} 선언을 못 찾았다`).not.toBeNull();
  });

  it('어떤 @layer 안에도 중첩돼 있지 않다 — 들어가는 순간 Tailwind 유틸리티에 진다', () => {
    const layered = (ancestors ?? []).filter((a) => a.startsWith('@layer'));
    expect(
      layered,
      `레이어 안으로 들어갔다: ${layered.join(' > ')}. ` +
        '레이어 순서는 명시도를 이기므로 min-h-8 이 그대로 이긴다.',
    ).toEqual([]);
  });

  it('`@media (pointer: coarse)` 안에만 있다 — 마우스에서는 규칙 자체가 안 만들어진다', () => {
    const coarse = (ancestors ?? []).filter((a) => a.includes('pointer: coarse'));
    expect(coarse.length, `조상: ${(ancestors ?? []).join(' > ')}`).toBe(1);
  });

  it('바닥값은 리터럴이 아니라 `--touch-target-min` 을 참조한다', () => {
    const rule = CSS.slice(CSS.indexOf(`.${FLOOR_CLASS} {`));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toMatch(/min-height:\s*var\(--touch-target-min\)/);
  });
});

/**
 * Is the marker **actually emitted**? A class defined but attached by nobody is a
 * dead line rather than a spec (`/gate-probe`, "a detector running on an empty
 * set").
 */
describe('값 층이 바닥을 실제로 내보낸다', () => {
  /** Shapes that emit their own height via `min-h-*` — growing pushes neighbours aside rather than overlapping them. */
  // segment joined on 2026-08-15 — it alone had no coarse promotion, reproducing
  // "two specs in one sheet" where Choice chips were 44 and segments stayed 24
  // (interaction seat prescription P4, co-signed by the system seat).
  const FLOORED: ControlShape[] = ['chip', 'row', 'pill', 'segment'];

  /**
   * The two shapes that **must not** get the floor. This is the most important
   * assertion in the file — it pins why "just raise everything to 44" is wrong.
   *
   * - `link` — a link in sentence flow. A 44px floor opens up the line spacing and
   *   tears the text apart. That is why WCAG 2.5.8 explicitly exempts inline links.
   * - `icon` — a square surface contract, so `min-h` cannot hold its shape.
   *   `touch-hit-expand`, which widens only the hit area and leaves the visible box
   *   alone, covers that case.
   */
  const NOT_FLOORED: ControlShape[] = ['link', 'icon'];

  it.each(FLOORED)('`%s` 는 바닥 표식을 낸다', (shape) => {
    expect(controlClass({ shape, size: 'md' })).toContain(FLOOR_CLASS);
  });

  it.each(NOT_FLOORED)('`%s` 는 바닥 표식을 내지 않는다', (shape) => {
    expect(controlClass({ shape, size: 'md' })).not.toContain(FLOOR_CLASS);
  });

  it('`icon` 은 대신 히트 확장을 낸다 — 면제가 아니라 다른 처방이다', () => {
    expect(controlClass({ shape: 'icon', size: 'md' })).toContain('touch-hit-expand');
  });

  /**
   * Idling guard. The assertions above already run the real `controlClass`, and this
   * additionally locks in that the value layer emits the marker from **one
   * constant** — writing the string by hand per shape means the next shape added
   * will miss one (the same reason as `DISABLED` and `FOCUS`).
   */
  it('표식은 상수 하나에서 나온다 — 모양마다 손으로 적지 않는다', () => {
    const literal = CONTROL_CLASS_SRC.match(new RegExp(`'${FLOOR_CLASS}'`, 'g')) ?? [];
    expect(literal.length, '문자열이 여러 번 적혔다 — 상수로 모아라').toBe(1);
    expect(CONTROL_CLASS_SRC).toMatch(/const TOUCH_FLOOR =/);
  });
});

/**
 * Form fields use the same floor — but **`boxed` only** (2026-08-06).
 *
 * `bare` sits inside a box the parent already draws. A 44px floor there makes the
 * control **push its parent's box outward from the inside** — the search palette's
 * input would tear out of its own box. The hierarchy (design-lead) seat's verdict found
 * all 10 lookup places to be ones where **the results are the attention winner**,
 * so a larger input would also invert the hierarchy.
 */
describe('폼 필드의 손가락 바닥', () => {
  const SIZES: FieldSize[] = ['xs', 'sm', 'md', 'lg'];

  it.each(SIZES)('boxed/%s 는 바닥 표식을 낸다', (size) => {
    expect(fieldClass({ frame: 'boxed', size })).toContain(FLOOR_CLASS);
  });

  it.each(SIZES)('bare/%s 는 바닥 표식을 내지 않는다 — 부모 상자를 밀어낸다', (size) => {
    expect(fieldClass({ frame: 'bare', size })).not.toContain(FLOOR_CLASS);
  });
});
