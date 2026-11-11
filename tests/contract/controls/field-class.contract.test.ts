
import { describe, expect, it } from 'vitest';

import { fieldClass, type FieldFrame, type FieldSize } from '@/shared/ui/control-class';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * `fieldClass` is a separate cva, not a ninth `shape`: fields are a different population and most
 * `tone` steps mean nothing for them. The key assertion maps each step 1:1 to the px of
 * `--control-h-{sm,md,lg}` read from `globals.css`; a vocabulary check passes wrong heights like 36.
 */

const GLOBALS = readGlobalCss();

const FRAMES: FieldFrame[] = ['boxed', 'bare'];
const SIZES: FieldSize[] = ['xs', 'sm', 'md', 'lg'];
const MULTILINE = [false, true] as const;

/** Tailwind's `h-N`/`min-h-N` are in 0.25rem units. */
const STEP_PX = 4;

function tokenPx(token: string): number | null {
  // Reads the **base declaration**, not the coarse block's `max(...)` redeclaration.
  for (const m of GLOBALS.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g'))) {
    const raw = m[1].trim();
    const plain = raw.match(/^(\d+(?:\.\d+)?)px$/);
    if (plain) return Number(plain[1]);
  }
  return null;
}

function heightPx(cls: string): number | null {
  const m = cls.match(/(?:^|\s)(?:min-)?h-(\d+(?:\.\d+)?)(?:\s|$)/);
  return m ? Number(m[1]) * STEP_PX : null;
}

const all = FRAMES.flatMap((frame) =>
  SIZES.flatMap((size) =>
    MULTILINE.map((multiline) => ({
      frame,
      size,
      multiline,
      cls: fieldClass({ frame, size, multiline }),
    })),
  ),
);

describe('fieldClass — all 16 combinations', () => {
  it('really builds the 16 combinations — if an axis shrinks this goes red first', () => {
    expect(all.length).toBe(16);
  });

  it.each(all.map((c) => [`${c.frame}/${c.size}/multiline=${c.multiline}`, c] as const))(
    '%s — emits no arbitrary value outside the ramp (bracketed px)',
    (_name, c) => {
      expect(c.cls).not.toMatch(/-\[\s*\d+(\.\d+)?px\s*\]/);
    },
  );

  it.each(all.map((c) => [`${c.frame}/${c.size}`, c] as const))(
    '%s — does not write colours directly (tokens only)',
    (_name, c) => {
      expect(c.cls).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(c.cls).not.toMatch(/rgba?\(/);
    },
  );
});

/**
 * **Step ↔ token 1:1.** This file's central assertion — it prevents the `h-9`
 * accident described in the preamble.
 */
describe('height steps map 1:1 to `--control-h-*`', () => {
  const MAP: Array<[FieldSize, string]> = [
    ['sm', '--control-h-sm'],
    ['md', '--control-h-md'],
    ['lg', '--control-h-lg'],
  ];

  it('the ramp tokens were really read from CSS — if unreadable the assertions below idle', () => {
    for (const [, token] of MAP) {
      expect(tokenPx(token), `could not read ${token} from globals.css`).toBeGreaterThan(0);
    }
  });

  it.each(MAP)('the height of boxed/%s equals `%s`', (size, token) => {
    const expected = tokenPx(token);
    for (const multiline of MULTILINE) {
      const cls = fieldClass({ frame: 'boxed', size, multiline });
      expect(heightPx(cls), `${size}/multiline=${multiline} → ${cls}`).toBe(expected);
    }
  });

  /**
   * `xs` is **not a height step** — it is a tier that only drops the radius one
   * level, so its height equals `sm` (the same grammar `chip`'s `xs` uses above).
   * Without this assertion, somebody could attach a fourth height to `xs` and nobody
   * would know.
   */
  it('xs has the same height as sm and only the radius is one layer lower', () => {
    const xs = fieldClass({ frame: 'boxed', size: 'xs' });
    const sm = fieldClass({ frame: 'boxed', size: 'sm' });
    expect(heightPx(xs)).toBe(heightPx(sm));
    expect(xs).toContain('rounded-micro');
    expect(sm).toContain('rounded-chip');
  });

  it('one line gets a hard height, several lines get min-height — what must grow is not clipped', () => {
    for (const size of SIZES) {
      expect(fieldClass({ frame: 'boxed', size, multiline: false })).toMatch(/(?:^|\s)h-\d/);
      expect(fieldClass({ frame: 'boxed', size, multiline: true })).toMatch(/(?:^|\s)min-h-\d/);
    }
  });
});

describe('frame — who emits the box', () => {
  it('boxed emits exactly one set of border, background, radius and focus', () => {
    for (const size of SIZES) {
      const cls = fieldClass({ frame: 'boxed', size });
      expect(cls).toContain('border-[color:var(--color-border-soft)]');
      expect(cls).toContain('bg-[color:var(--color-overlay-1)]');
      expect(cls).toMatch(/rounded-(chip|micro)/);
      expect(cls).toContain('focus-visible:border-[color:var(--color-indigo-a46)]');
    }
  });

  /**
   * `bare` must not emit a box: the parent already emitted one, and a second box pushes it outward. In
   * lookup places the result must win attention over the input.
   */
  it.each(SIZES.flatMap((s) => MULTILINE.map((m) => [`${s}/multiline=${m}`, s, m] as const)))(
    'bare/%s emits no dimension, border or radius at all',
    (_n, size, multiline) => {
      const cls = fieldClass({ frame: 'bare', size, multiline });
      expect(cls, 'emitted a height').not.toMatch(/(?:^|\s)(?:min-)?h-\d/);
      expect(cls, 'emitted a border').not.toMatch(/(?:^|\s)border(?:\s|-)/);
      expect(cls, 'emitted a radius').not.toMatch(/rounded-/);
      expect(cls, 'emitted a horizontal inset').not.toMatch(/(?:^|\s)px-/);
      expect(cls).toContain('bg-transparent');
    },
  );

  it('bare size changes only typography while the parent retains the frame', () => {
    const variants = new Set(
      SIZES.flatMap((size) =>
        MULTILINE.map((multiline) => fieldClass({ frame: 'bare', size, multiline })
          .split(/\s+/).filter((token) => !/^(?:text-body(?:-lg)?|leading-body-lg)$/.test(token)).join(' ')),
      ),
    );
    expect([...variants].length, `Frame variants: ${[...variants].join(' | ')}`).toBe(2);
  });
});

describe('base — what every field shares', () => {
  it('there is exactly one type step — with two, CSS order decides the winner', () => {
    for (const c of all) {
      const hits = [...c.cls.matchAll(/(?:^|\s)text-body(?:-lg)?(?:\s|$)/g)];
      expect(hits.length, `${c.frame}/${c.size}: ${c.cls}`).toBe(1);
    }
  });

  it('placeholder ink differs from body ink — if equal, the input value and the hint are indistinguishable', () => {
    for (const c of all) {
      expect(c.cls).toContain('text-[color:var(--color-text-primary)]');
      expect(c.cls).toContain('placeholder:text-[color:var(--color-text-quaternary)]');
    }
  });

  it('base emits the disabled affordance — if each component remembers it, one gets missed', () => {
    for (const c of all) expect(c.cls).toContain('disabled:cursor-not-allowed');
  });

  /**
   * Width is not the value layer's share: consumers get width from `w-full` or a parent grid, and an
   * emitted width would stop migration being 0px.
   */
  it('emits no width', () => {
    for (const c of all) {
      expect(c.cls, `emitted a width: ${c.cls}`).not.toMatch(/(?:^|\s)w-(full|\d)/);
      expect(c.cls).not.toMatch(/(?:^|\s)flex-1/);
    }
  });
});
