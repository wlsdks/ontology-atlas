import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTROL_DISABLED_CLASS } from '@/shared/ui/control-class';

/**
 * If it cannot be pressed, it must not look pressable: a tooltip needs hovering, so a disabled chip
 * without `disabled:` handling leaves silence for someone pressing it. Lint cannot catch it, since
 * the question is whether handling exists at all.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * The value authority is `CONTROL_DISABLED_CLASS` in `control-class.ts`. This asks where a file gets
 * its disabled handling (the constant or its own literal) and whether every path yields one value,
 * so moving to the constant does not break the gate.
 */
const DISABLED_STEP = (() => {
  const m = CONTROL_DISABLED_CLASS.match(/disabled:opacity-(\d+)/);
  if (!m) throw new Error('CONTROL_DISABLED_CLASS has no disabled dimming value');
  return m[1];
})();

/**
 * Pressable shared primitives. **Adding one means adding a row here** — this list is
 * the gate's range, and a missing primitive is the same as no gate.
 * `Chip`, `IconButton`, and `RowButton` receive theirs from the value layer
 * (`control-class.ts`), so what is registered is the file that emits the value.
 */
const PRESSABLE_PRIMITIVES = [
  'src/shared/ui/controls/button.tsx',
  'src/shared/ui/controls/chrome-chip.tsx',
  'src/shared/ui/controls/chrome-tile.tsx',
  'src/shared/ui/fields/select.tsx',
  'src/shared/ui/control-class.ts',
] as const;

/** Composing the constant brings all four treatments at once: dimming, cursor, shadow, and hover suppression. */
const composesConstant = (source: string) => source.includes('CONTROL_DISABLED_CLASS');

describe('disabled affordance — value layer', () => {
  it('CONTROL_DISABLED_CLASS carries the four treatments as one set', () => {
    // Dimming alone leaves a mouse user unaware until they click; a cursor alone gives
    // touch users no signal at all; and a live hover makes the hand conclude it is
    // pressable before the eye does.
    expect(CONTROL_DISABLED_CLASS).toMatch(/disabled:opacity-\d+/);
    expect(CONTROL_DISABLED_CLASS).toContain('disabled:cursor-not-allowed');
    expect(CONTROL_DISABLED_CLASS).toContain('disabled:shadow-none');
    expect(CONTROL_DISABLED_CLASS).toMatch(/disabled:hover:/);
  });

  it.each(PRESSABLE_PRIMITIVES)('%s — takes the disabled treatment from the value layer or its own literal', (path) => {
    const source = read(path);
    if (composesConstant(source)) return; // Receives the whole value-layer set
    expect(source, `${path}: no disabled dimming treatment`).toMatch(/disabled:opacity-/);
    expect(source, `${path}: no disabled cursor treatment`).toContain('disabled:cursor-not-allowed');
    expect(source, `${path}: no disabled hover neutralisation`).toMatch(/disabled:hover:/);
  });

  it('the disabled dimming value does not diverge per path', () => {
    // Drawing one state with two values is coincidence, not a system.
    const values = new Set(
      PRESSABLE_PRIMITIVES.flatMap((p) => [...read(p).matchAll(/disabled:opacity-(\d+)/g)].map((m) => m[1])),
    );
    values.add(DISABLED_STEP);
    expect([...values], `the disabled opacity has several values: ${[...values].join(', ')}`).toEqual([DISABLED_STEP]);
  });

  it('the value the lint gate allows equals the value of the value layer', () => {
    // eslint's disabledAffordanceSelectors take the form "forbid anything but 55", so
    // the number 55 is written in the lint config too. When the value layer moves, this
    // turns red and forces both to move together. (This comparison was chosen over a
    // file exemption block: this config has three times suffered a block forgetting to
    // re-spread the selector array.)
    const eslintConfig = read('eslint.config.mjs');
    const gates = [...eslintConfig.matchAll(/disabled\):opacity-\(\?!(\d+)/g)].map((m) => m[1]);
    expect(gates.length, 'disabledAffordanceSelectors is missing from eslint.config.mjs').toBeGreaterThanOrEqual(2);
    expect(new Set(gates), 'the disabled dimming value lint allows differs from the value layer').toEqual(new Set([DISABLED_STEP]));
  });
});

describe('recent-changes chip — states the reason it cannot be used per mode', () => {
  const HOME = read('src/views/home/ui/map-readouts/TopologyCommandChrome.tsx');

  it('emits different sentences for the no-folder reason and the my-folder reason', () => {
    // Telling someone with no folder loaded to "edit a document" **presumes they have a
    // document to edit.** The real reason is different: the feature has no meaning until they
    // open a folder.
    expect(HOME).toContain('spotlightNeedsFolderTooltip');
    expect(HOME).toContain('spotlightEmptyTooltip');
  });

  it.each(['ko', 'en'])('the %s copy explains the no-folder reason with a folder', (locale) => {
    const messages = JSON.parse(read(`messages/${locale}.json`));
    const text: string = messages.topology.controls.spotlightNeedsFolderTooltip;
    expect(text, `${locale}: no no-folder reason copy`).toBeTruthy();
    // Without "what to do next" it is an apology, not guidance — the same discipline as
    // the degradation contract in `surfaces.md` (why plus where).
    expect(text, `${locale}: does not state the next action (folder)`).toMatch(locale === 'ko' ? /폴더/ : /folder/i);
  });
});

it("keeps the protected topology owners connected to the route", () => {
  const route = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
  expect(route).toContain('<TopologyCommandChrome');
});
