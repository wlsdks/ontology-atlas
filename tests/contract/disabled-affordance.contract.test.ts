import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTROL_DISABLED_CLASS } from '@/shared/ui/control-class';

/**
 * **If it cannot be pressed, it must not look pressable.**
 *
 * ## Why this gate exists
 *
 * Owner report, 2026-08-03: *"I pressed 'Recent changes' and nothing happened?"*
 * That chip was `disabled`, and a code comment said the slot stays and a tooltip
 * gives the reason. Measured, its **computed style was completely identical to the
 * three active chips beside it** — color, bg, border, opacity, and cursor all the
 * same.
 *
 * | Chip | disabled | opacity | cursor |
 * |---|---|---|---|
 * | Auto-align | false | 1 | default |
 * | Search | false | 1 | default |
 * | Switch to my data | false | 1 | default |
 * | **Recent changes** | **true** | **1** | **default** |
 *
 * `ChromeChip` had **no `disabled:` handling at all**, and being a shared primitive
 * meant **every chip carried the same hole**. The tooltip requires hovering and
 * waiting, so **for someone pressing it there was only silence.**
 *
 * This repository's recurring lesson: **a spec that exists only in a comment does
 * not exist on screen.** Lint cannot catch it — the question is not a value rule but
 * whether handling for this state exists at all.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * The value authority is `CONTROL_DISABLED_CLASS` in `control-class.ts`. This test
 * asks about **the value, not the class string in the source** (rewritten
 * 2026-08-06): it used to require a `disabled:opacity-` literal in every file, so
 * exactly the right refactor — moving to a value-layer constant — broke the gate. It
 * now asks only where a file receives its disabled handling from (composing the
 * constant or its own literal) and whether every path yields one value.
 */
const DISABLED_STEP = (() => {
  const m = CONTROL_DISABLED_CLASS.match(/disabled:opacity-(\d+)/);
  if (!m) throw new Error('CONTROL_DISABLED_CLASS 에 비활성 흐림 값이 없다');
  return m[1];
})();

/**
 * Pressable shared primitives. **Adding one means adding a row here** — this list is
 * the gate's range, and a missing primitive is the same as no gate.
 * `Chip`, `IconButton`, and `RowButton` receive theirs from the value layer
 * (`control-class.ts`), so what is registered is the file that emits the value.
 */
const PRESSABLE_PRIMITIVES = [
  'src/shared/ui/button.tsx',
  'src/shared/ui/chrome-chip.tsx',
  'src/shared/ui/chrome-tile.tsx',
  'src/shared/ui/select.tsx',
  'src/shared/ui/control-class.ts',
] as const;

/** Composing the constant brings all four treatments at once: dimming, cursor, shadow, and hover suppression. */
const composesConstant = (source: string) => source.includes('CONTROL_DISABLED_CLASS');

describe('비활성 어포던스 — 값 층', () => {
  it('CONTROL_DISABLED_CLASS 가 네 처리를 한 세트로 싣는다', () => {
    // Dimming alone leaves a mouse user unaware until they click; a cursor alone gives
    // touch users no signal at all; and a live hover makes the hand conclude it is
    // pressable before the eye does.
    expect(CONTROL_DISABLED_CLASS).toMatch(/disabled:opacity-\d+/);
    expect(CONTROL_DISABLED_CLASS).toContain('disabled:cursor-not-allowed');
    expect(CONTROL_DISABLED_CLASS).toContain('disabled:shadow-none');
    expect(CONTROL_DISABLED_CLASS).toMatch(/disabled:hover:/);
  });

  it.each(PRESSABLE_PRIMITIVES)('%s — 비활성 처리를 값 층 또는 자기 리터럴로 받는다', (path) => {
    const source = read(path);
    if (composesConstant(source)) return; // Receives the whole value-layer set
    expect(source, `${path}: 비활성 흐림 처리가 없다`).toMatch(/disabled:opacity-/);
    expect(source, `${path}: 비활성 커서 처리가 없다`).toContain('disabled:cursor-not-allowed');
    expect(source, `${path}: 비활성 호버 무력화가 없다`).toMatch(/disabled:hover:/);
  });

  it('비활성 흐림 값이 경로마다 갈리지 않는다', () => {
    // Drawing one state with two values is coincidence, not a system.
    const values = new Set(
      PRESSABLE_PRIMITIVES.flatMap((p) => [...read(p).matchAll(/disabled:opacity-(\d+)/g)].map((m) => m[1])),
    );
    values.add(DISABLED_STEP);
    expect([...values], `비활성 불투명도가 여러 값이다: ${[...values].join(', ')}`).toEqual([DISABLED_STEP]);
  });

  it('lint 게이트가 허용하는 값과 값 층의 값이 같다', () => {
    // eslint's disabledAffordanceSelectors take the form "forbid anything but 55", so
    // the number 55 is written in the lint config too. When the value layer moves, this
    // turns red and forces both to move together. (This comparison was chosen over a
    // file exemption block: this config has three times suffered a block forgetting to
    // re-spread the selector array.)
    const eslintConfig = read('eslint.config.mjs');
    const gates = [...eslintConfig.matchAll(/disabled\):opacity-\(\?!(\d+)/g)].map((m) => m[1]);
    expect(gates.length, 'disabledAffordanceSelectors 가 eslint.config.mjs 에 없다').toBeGreaterThanOrEqual(2);
    expect(new Set(gates), 'lint 가 허용하는 비활성 흐림 값이 값 층과 다르다').toEqual(new Set([DISABLED_STEP]));
  });
});

describe('최근 변경 칩 — 못 쓰는 이유를 모드별로 말한다', () => {
  const HOME = read('src/views/home/ui/HomePage.tsx');

  it('샘플과 내 폴더의 사유를 다른 문장으로 낸다', () => {
    // Telling someone viewing the sample to "edit a document" **presumes they have a
    // document to edit.** The real reason is different: the sample's date is when this
    // repository last touched the fixture, which has nothing to do with the user, and
    // the feature has no meaning until they open a folder.
    expect(HOME).toContain('spotlightSampleTooltip');
    expect(HOME).toContain('spotlightEmptyTooltip');
  });

  it.each(['ko', 'en'])('%s 문구가 샘플 사유를 폴더로 설명한다', (locale) => {
    const messages = JSON.parse(read(`messages/${locale}.json`));
    const text: string = messages.topology.controls.spotlightSampleTooltip;
    expect(text, `${locale}: 샘플 사유 문구가 없다`).toBeTruthy();
    // Without "what to do next" it is an apology, not guidance — the same discipline as
    // the degradation contract in `surfaces.md` (why plus where).
    expect(text, `${locale}: 다음 행동(폴더)을 안 말한다`).toMatch(locale === 'ko' ? /폴더/ : /folder/i);
  });
});
