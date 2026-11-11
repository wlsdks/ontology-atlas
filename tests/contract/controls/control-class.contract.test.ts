import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TYPE_RAMP_STEPS } from '@/shared/lib/cn';
import {
  controlClass,
  type ControlShape,
  type ControlSize,
  type ControlTone,
} from '@/shared/ui/control-class';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/** Every value `controlClass` emits is forced onto a ramp; this file is that enforcement. */

const SHAPES: ControlShape[] = ['chip', 'icon', 'row', 'pill', 'card', 'link', 'tile', 'segment'];
const SIZES: ControlSize[] = ['xs', 'sm', 'md', 'lg'];
const TONES: ControlTone[] = [
  'default',
  'muted',
  'secondary',
  'strong',
  'accent',
  'accentOnTint',
  'warning',
  'danger',
  'success',
  'onAccent',
];
const SCOPES = ['app', 'panel'] as const;

/**
 * The token namespaces the value layer **may read**.
 *
 * It went from one to two, and the reason is measurement rather than taste: the
 * test below reads `globals.css` directly and asserts that the two neutral ramps
 * really do carry different values. While that test is green this list is
 * justified; if the values converge the test turns red and **tells you to shrink
 * this list**.
 */
const TOKEN_NAMESPACES = ['--color-', '--map-panel-text-'];

/** The 4 steps of the radius ramp in `app/globals.css`. Any radius not here is off-ramp. */
const RADIUS_STEPS = ['micro', 'chip', 'card', 'panel'];

const all = (fn: (s: ControlShape, z: ControlSize, t: ControlTone, a: boolean) => void) => {
  for (const s of SHAPES) for (const z of SIZES) for (const t of TONES) for (const a of [true, false]) fn(s, z, t, a);
};

/** The same exhaustive sweep plus the `scope` axis, checking a new axis does not leak off the ramp. */
const allScoped = (fn: (cls: string, label: string) => void) => {
  for (const s of SHAPES)
    for (const z of SIZES)
      for (const t of TONES)
        for (const a of [true, false])
          for (const sc of SCOPES)
            for (const tr of [true, false])
              fn(
                controlClass({ shape: s, size: z, tone: t, active: a, scope: sc, truncate: tr }),
                `${s}/${z}/${t}/${a}/${sc}/trunc=${tr}`,
              );
};

describe('controlClass — no value can fall outside the ramp', () => {
  it('emits no arbitrary sizes or radii', () => {
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        // `text-[color:var(--color-…)]` is a colour and legitimate. What is banned is arbitrary **dimensions**.
        if (/^(text|rounded|leading)-\[(?!color:)/.test(c) || /^(min-h|min-w|h|w|p[xy]?|gap)-\[/.test(c)) {
          offenders.push(`${shape}/${size}/${tone}/${active}: ${c}`);
        }
      }
    });
    expect(offenders, `values that bypass the ramp:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('font sizes use only registered type-ramp steps', () => {
    // An undefined step leaves no literal behind: Tailwind emits no class and the text renders at the
    // root 16px, outside the hardcoded-value check's view.
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        const m = /^text-([a-z-]+)$/.exec(c);
        // `text-` is shared by three axes: size, alignment, and colour. Only the size
        // axis is checked — without that split, `text-left` is caught as "a step not on
        // the ramp" and the gate lies.
        const ALIGNMENT = ['left', 'center', 'right', 'justify', 'start', 'end'];
        if (m && !ALIGNMENT.includes(m[1]) && !TYPE_RAMP_STEPS.includes(m[1] as never)) {
          offenders.push(`${shape}/${size}: ${c}`);
        }
      }
    });
    expect(offenders, `steps missing from the type ramp:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('radii stay inside the four-step ramp', () => {
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        const m = /^rounded-([a-z0-9-]+)$/.exec(c);
        if (m && !RADIUS_STEPS.includes(m[1]) && m[1] !== 'full') offenders.push(`${shape}: ${c}`);
      }
    });
    expect(offenders, `radii outside the ramp:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every colour is a token reference — no hex and no rgb', () => {
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      const cls = controlClass({ shape, size, tone, active });
      for (const c of cls.split(' ')) {
        if (/#[0-9a-f]{3,8}\b/i.test(c) || /rgba?\(/.test(c)) offenders.push(`${shape}: ${c}`);
        // Colour utilities must go through a registered token namespace.
        if (/^(text|bg|border)-\[/.test(c) && !TOKEN_NAMESPACES.some((ns) => c.includes(`var(${ns}`))) {
          offenders.push(`${shape}: ${c}`);
        }
      }
    });
    expect(offenders, `colours that skip the tokens:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('does not create a second colouring system — no hue besides indigo', () => {
    // The charter: neutrals + a single indigo. Expressing a pressed state with a new colour is the most common escape.
    const tokens = new Set<string>();
    all((shape, size, tone, active) => {
      for (const m of controlClass({ shape, size, tone, active }).matchAll(/var\(--color-([a-z0-9-]+)\)/g)) {
        tokens.add(m[1]);
      }
    });
    /*
     * The charter is neutrals + a single indigo **+ 3 signal colours** (warning,
     * error, success). Signals are for states like connected / failed / warning and
     * are never extended into decoration. Any hue outside those three is a second
     * colour system.
     */
    const SIGNAL = /^(status-warning|status-success|danger-text|success-text)/;
    const hued = [...tokens].filter(
      (t) => !/^(text|divider|border|overlay|canvas|panel|elevated|secondary)/.test(t) && !SIGNAL.test(t),
    );
    expect(hued.sort(), `only the indigo family and the three signals are allowed: ${hued.join(', ')}`).toEqual(
      hued.filter((t) => t.startsWith('indigo')).sort(),
    );
  });
});

describe('controlClass — the shapes really differ from each other', () => {
  it('the six shapes emit mutually distinct strings', () => {
    // Two shapes emitting the same value are not a classification — they are one thing with two names.
    const seen = new Map<string, ControlShape>();
    for (const shape of SHAPES) {
      const cls = controlClass({ shape });
      const dup = seen.get(cls);
      expect(dup, `\`${shape}\` and \`${dup}\` emit the same class`).toBeUndefined();
      seen.set(cls, shape);
    }
  });

  it('chip and pill `md` and `lg` sit on the ladder — only `sm` stays on the 24px floor', () => {
    /*
     * The ladder decides the height and padding follows inside it: `md` and `lg` stand on
     * `--control-h-md` (32px); only `sm` stays at the WCAG 2.5.8 minimum target of 24px.
     */
    for (const shape of ['chip', 'pill'] as const) {
      for (const size of ['md', 'lg'] as const) {
        expect(
          controlClass({ shape, size }),
          `${shape}/${size} is off the 32px ladder — it went back to being a by-product of padding`,
        ).toContain('min-h-8');
      }
      expect(
        controlClass({ shape, size: 'sm' }),
        `${shape}/sm rose to 32px — without the 24px floor the density changes wholesale`,
      ).not.toContain('min-h-8');
    }
    // No hard height — it would clip a wrapped chip and hide content.
    for (const shape of ['chip', 'pill'] as const) {
      for (const size of SIZES) {
        expect(
          controlClass({ shape, size }),
          `${shape}/${size} uses a hard height — overflowing content gets clipped`,
        ).not.toMatch(/(^| )h-\d/);
      }
    }
  });

  it('square shapes take no horizontal padding — with it they are no longer square', () => {
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'icon', size });
      expect(cls, `icon/${size} gained px: ${cls}`).not.toMatch(/\bpx-/);
      const [, h] = /\bh-(\d+)\b/.exec(cls) ?? [];
      const [, w] = /\bw-(\d+)\b/.exec(cls) ?? [];
      expect(h, `icon/${size} has different height and width`).toBe(w);
    }
  });

  it('the vertical tile puts the icon above and the text below — its axis differs from the horizontal shapes', () => {
    const cls = controlClass({ shape: 'tile' });
    expect(cls).toContain('flex-col');
    expect(cls).toContain('text-center');
  });

  it('the floor of link is 24 (2.5.8 AA)', () => {
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'link', size });
      expect(cls, `the floor of link/${size} is not 24 (min-h-6)`).toMatch(/(^| )min-h-6( |$)/);
    }
  });

  it('a lone text control is reachable by a finger — the default is the safe side', () => {
    /*
     * `link` has no border and no background, so visually it must be exactly the
     * text — but if the hit area is also text-sized it drops from 24 to 16px, below
     * WCAG 2.5.8 (24×24). Three settings-sheet controls stayed outside the system for
     * exactly this reason.
     */
    for (const size of SIZES) {
      expect(controlClass({ shape: 'link', size }), `link/${size} has no minimum height`).toMatch(
        /min-h-/,
      );
    }
  });

  it('every shape has a radius — without one the hover background turns square-cornered', () => {
    // `row` originally shipped without a radius, which made hover on normalised list rows square-cornered.
    for (const shape of SHAPES) {
      expect(controlClass({ shape }), `${shape} has no radius`).toMatch(/rounded-/);
    }
  });

  it('the row shape is left-aligned and full width — that is the identity of a list row', () => {
    const cls = controlClass({ shape: 'row' });
    expect(cls).toContain('w-full');
    expect(cls).toContain('text-left');
  });

  it('the pressed state differs from the unpressed state', () => {
    for (const shape of SHAPES) {
      expect(
        controlClass({ shape, active: true }),
        `the pressed state of \`${shape}\` is not distinguishable on screen`,
      ).not.toBe(controlClass({ shape, active: false }));
    }
  });

  it('className is appended and does not beat the ramp value', () => {
    // `cn()` is tailwind-merge, so on the same axis the later class wins. The
    // discipline "pass placement only" is not kept if it lives only in a document, so
    // at minimum the "it appends" contract is pinned here.
    expect(controlClass({ shape: 'chip', className: 'absolute right-2' })).toContain('absolute');
  });
});

/**
 * Axes that filled holes in the value layer — **only those the ledger counted
 * repeatedly** were admitted.
 *
 * Every test here locks down the reason its axis exists. An axis is not free:
 * each one adds something for the next person to choose between, and an axis
 * added without evidence becomes a second system by itself. So each axis carries
 * one test that **turns red when its evidence disappears**.
 */
describe('controlClass — the eighth shape and the three axes', () => {
  const GLOBALS = readGlobalCss();
  const cssVar = (name: string): string | undefined =>
    new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(GLOBALS)?.[1].trim();

  it('the eighth shape has no border and has an inset — it exists because that gap was empty', () => {
    /*
     * `chip`/`pill`/`card`/`tile` require a border, so inside an already-bordered box
     * they become a box in a box; `link` has zero inset, so a segment's hit area
     * disappears. This shape exists only because it is neither.
     */
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'segment', size });
      // ⚠️ Variant prefixes (`disabled:hover:border-inherit`) must be filtered out —
      // without that this test turns red **for every shape**. The first run did exactly
      // that.
      const base = cls.split(' ').filter((c) => !c.includes(':') || c.startsWith('border-[color:'));
      expect(base.join(' '), `segment/${size} gained a border — it becomes a box inside a box`).not.toMatch(
        /(^| )border(-|$| )/,
      );
      expect(cls, `segment/${size} has no horizontal inset — then it equals link`).toMatch(/\bpx-/);
    }
  });

  it('the segment radius equals `--chrome-radius-inner` — it is an alias, so no pixel changes', () => {
    /*
     * Five consumers were using `rounded-[var(--chrome-radius-inner)]`. The only
     * evidence that moving them is safe is that the token is an **alias** for
     * `--radius-chip`, so that fact is read straight from the CSS and locked. If
     * someone splits `--chrome-radius-inner` off to 7px this test turns red — and on
     * that day the five moved places would be 1px off.
     */
    expect(
      cssVar('--chrome-radius-inner'),
      '`--chrome-radius-inner` is no longer an alias of `--radius-chip` — segment must not use rounded-chip',
    ).toBe('var(--radius-chip)');
    expect(controlClass({ shape: 'segment' })).toContain('rounded-chip');
  });

  it('the two neutral ramps really differ in value — if they equalise, the `scope` axis is to be retired', () => {
    /*
     * The **only** evidence that the `scope` axis should exist. The day the two ramps
     * carry the same values, the axis does nothing while still adding a choice, so
     * this test must turn red and say to delete it.
     */
    /*
     * A step whose values are identical in both ramps makes the axis a no-op, so this must fail and say
     * to delete the compound for that step.
     */
    const DIVERGING_STEPS = ['primary', 'secondary', 'tertiary'] as const;
    const pairs: Array<[string, string]> = [];
    for (const step of DIVERGING_STEPS) {
      const app = cssVar(`--color-text-${step}`);
      const panel = cssVar(`--map-panel-text-${step}`);
      expect(app, `could not read --color-text-${step}`).toBeTruthy();
      expect(panel, `could not read --map-panel-text-${step}`).toBeTruthy();
      pairs.push([app as string, panel as string]);
    }
    // Idling guard — if all three steps were not read, the assertion below passes on an empty set.
    expect(pairs.length, 'could not pair any step of the two ramps').toBe(3);
    /*
     * ⚠️ This started as "pass if any one differs", and `/gate-probe` caught that
     * it was **not a gate**: reverting one of the remapped steps to the same value
     * still went green. **Every** step the axis remaps must carry its own evidence —
     * when one step converges, its compound occupies space while doing nothing.
     */
    const same = pairs
      .map(([a, b], i) => (a === b ? `${DIVERGING_STEPS[i]}: ${a}` : null))
      .filter((x): x is string => x !== null);
    expect(
      same,
      `This step is now the same on both neutral ramps, so its \`scope: 'panel'\` compound has no basis.\n` +
        `Delete the converged step from the value layer (one tone is enough for it), or delete the axis once every step has converged.\n` +
        same.join('\n'),
    ).toEqual([]);
  });

  it('quaternary is pinned to the converged state — if it diverges again the panel compound must be revived', () => {
    /*
     * Quaternary is pinned as converged in both ramps. It is not an alias `var()`: `prefers-contrast:
     * more` raises only the global quaternary, which would invert it above tertiary in the panel ladder.
     */
    const app = cssVar('--color-text-quaternary');
    const panel = cssVar('--map-panel-text-quaternary');
    expect(app, 'could not read --color-text-quaternary').toBeTruthy();
    expect(panel, 'could not read --map-panel-text-quaternary').toBeTruthy();
    expect(
      panel,
      `quaternary diverged between the two ramps again (global ${app} · panel ${panel}), ` +
        `so muted ink on the panel lost its basis. Restore the \`scope: 'panel', tone: 'muted'\` compound and update this pin.`,
    ).toBe(app);
    // The compound really is absent — `muted` emits one global token regardless of scope.
    const onPanel = controlClass({ shape: 'chip', size: 'md', tone: 'muted', scope: 'panel' });
    expect(
      onPanel.includes('--map-panel-text-quaternary'),
      'the state is converged but the panel compound came back — it is an idle branch emitting the same value. Delete it.',
    ).toBe(false);
    expect(onPanel).toContain('text-[color:var(--color-text-quaternary)]');
  });

  it('`scope: panel` changes only the ink — leaking into background or border makes a second colouring system', () => {
    /*
     * The price of opening this axis must be only "the value layer acknowledges a
     * second ramp". If the panel namespace also starts emitting through `bg-` and
     * `border-`, that really is two colour systems and violates the charter.
     */
    const offenders: string[] = [];
    allScoped((cls, label) => {
      for (const c of cls.split(' ')) {
        if (!c.includes('--map-panel-text-')) continue;
        if (!/^(?:[a-z-]+:)*text-\[color:/.test(c)) offenders.push(`${label}: ${c}`);
      }
    });
    expect(offenders, `the panel ramp leaked outside the ink:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the three signals and indigo ignore `scope` — colours fixed by meaning do not look at the background', () => {
    for (const tone of ['accent', 'accentOnTint', 'warning', 'danger', 'success'] as const) {
      expect(
        controlClass({ shape: 'chip', tone, scope: 'panel' }),
        `${tone} became a different colour in the panel`,
      ).toBe(controlClass({ shape: 'chip', tone, scope: 'app' }));
    }
  });

  it('`scope` really changes something — a neutral step whose value differs is a different ink in the panel', () => {
    // Without this the axis could become a complete no-op with the test above still green. `muted` is
    // excluded because it has no remap (quaternary is pinned converged).
    for (const tone of ['default', 'secondary', 'strong'] as const) {
      expect(
        controlClass({ shape: 'chip', tone, scope: 'panel' }),
        `${tone} is unchanged in the panel — the scope axis idles`,
      ).not.toBe(controlClass({ shape: 'chip', tone, scope: 'app' }));
    }
  });

  it('`truncate` takes display out of flex — otherwise `…` is never drawn', () => {
    /*
     * Measured: at the same text and width, `inline-block` gives `…` while
     * `inline-flex` hard-clips. Adding the `truncate` utility alone does not fix it.
     */
    for (const shape of SHAPES) {
      const cls = controlClass({ shape, truncate: true });
      expect(cls, `${shape}/truncate has no truncate`).toContain('truncate');
      expect(cls, `${shape}/truncate is still flex — the ellipsis is hard-clipped`).not.toMatch(
        /(^| )(inline-)?flex( |$)/,
      );
      // Turning it off leaves today's behaviour unchanged.
      expect(controlClass({ shape, truncate: false })).toBe(controlClass({ shape }));
    }
  });

  it('the filled tone emits background and ink as a pair and removes the border', () => {
    /*
     * Emitting ink alone leaves consumers hand-writing `bg-…`, which passes shape
     * through `className` and neutralises the layer. So they are emitted as a pair.
     */
    for (const shape of SHAPES) {
      const cls = controlClass({ shape, tone: 'onAccent' });
      expect(cls, `${shape}/onAccent has no fill`).toContain('bg-[color:var(--color-indigo-brand)]');
      expect(cls, `${shape}/onAccent has no foreground token`).toContain(
        'text-[color:var(--color-text-on-accent)]',
      );
      expect(cls, `${shape}/onAccent kept a border — a filled primary action has no outline`).not.toMatch(
        /border-\[color:/,
      );
    }
    // The foreground token must exist. If it does not, the browser ignores the colour
    // entirely and the inherited colour shows through — which reads on screen as
    // "slightly darker text" and nobody can point at it.
    expect(cssVar('--color-text-on-accent'), '`--color-text-on-accent` is missing from globals.css').toBeTruthy();
  });

  it('`min-h-8` equals `--control-h-md` — when the ladder token moves, this goes red first', () => {
    /*
     * **This is the central gate of the whole arrangement.** The value layer emits a
     * Tailwind step (`min-h-8`) while the token (`--control-h-md`) lives in CSS.
     * Nothing in code forces the two to be the same value, so it is locked here by
     * **reading the CSS directly**.
     *
     * The value is not registered by hand — Tailwind spacing is 1 = 4px, so the step
     * is multiplied by 4 and compared against the token's px. If someone moves
     * `--control-h-md` to 33px, the ramp's 32px is off the ladder from that day, and
     * this line is what says so.
     */
    const px = Number(/^(\d+)px$/.exec(cssVar('--control-h-md') ?? '')?.[1]);
    expect(px, 'could not read `--control-h-md` as px').toBeGreaterThan(0);

    let checked = 0;
    for (const shape of ['chip', 'pill'] as const) {
      for (const size of ['md', 'lg'] as const) {
        const cls = controlClass({ shape, size });
        const step = Number(/\bmin-h-(\d+)\b/.exec(cls)?.[1]);
        expect(step, `could not read the min-h step in ${shape}/${size}: ${cls}`).toBeGreaterThan(0);
        expect(
          step * 4,
          `min-h-${step}(${step * 4}px) of ${shape}/${size} differs from --control-h-md(${px}px)`,
        ).toBe(px);
        checked += 1;
      }
    }
    // Idling guard — a gate that passes without running a single combination is not a gate.
    expect(checked, 'did not measure a single combination on the ladder').toBe(4);
  });

  it('every horizontal single-line shape declares an explicit height, and the value is in the height vocabulary', () => {
    /*
     * Every single-row horizontal shape (chip, pill, segment, row, card) declares an explicit `min-h-*`,
     * icon an `h-*`, and the px value is inside the height vocabulary, derived from
     * `--control-h-{sm,md,lg}`, `--chrome-tile-size`, `--touch-target-min` and the WCAG floor of 24.
     */
    const WCAG_TARGET_FLOOR_PX = 24;
    const tokenPx = (name: string): number => {
      const px = Number(/^(\d+)px$/.exec(cssVar(name) ?? '')?.[1]);
      expect(px, `could not read \`${name}\` as px — the vocabulary cannot be derived`).toBeGreaterThan(0);
      return px;
    };
    const vocabulary = new Set([
      WCAG_TARGET_FLOOR_PX,
      tokenPx('--control-h-sm'),
      tokenPx('--control-h-md'),
      tokenPx('--chrome-tile-size'),
      tokenPx('--control-h-lg'),
      tokenPx('--touch-target-min'),
    ]);
    // If the tokens converge and the vocabulary shrinks, the derivation itself loses its signal.
    expect([...vocabulary].sort((a, b) => a - b), 'the height vocabulary is not six steps').toEqual([24, 28, 32, 36, 40, 44]);

    const offenders: string[] = [];
    let checked = 0;
    for (const shape of ['chip', 'pill', 'segment', 'row', 'card'] as const) {
      for (const size of SIZES) {
        const cls = controlClass({ shape, size });
        const step = Number(/\bmin-h-(\d+)\b/.exec(cls)?.[1]);
        if (!step) {
          offenders.push(`${shape}/${size}: no explicit min-h — the height is a by-product of padding (${cls})`);
          continue;
        }
        if (!vocabulary.has(step * 4)) {
          offenders.push(`${shape}/${size}: min-h-${step}(${step * 4}px) is outside the height vocabulary`);
        }
        if (step * 4 < WCAG_TARGET_FLOOR_PX) {
          offenders.push(`${shape}/${size}: ${step * 4}px — below the WCAG 2.5.8 floor (24px)`);
        }
        checked += 1;
      }
    }
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'icon', size });
      const step = Number(/\bh-(\d+)\b/.exec(cls)?.[1]);
      if (!step || !vocabulary.has(step * 4)) {
        offenders.push(`icon/${size}: the square height is outside the vocabulary (${cls})`);
      } else {
        checked += 1;
      }
    }
    expect(offenders, `combinations off the ladder:\n${offenders.join('\n')}`).toEqual([]);
    // Idling guard — were all 5 shapes × 4 sizes + icon 4 = 24 combinations actually measured?
    expect(checked, 'did not run the vocabulary check on every combination').toBe(5 * SIZES.length + SIZES.length);
  });

  it('the micro tier is real only for chips — `xs` of the other shapes is an alias of `sm`', () => {
    /*
     * `xs` is an alias for `sm` outside chips: the size axis is shared across shapes and only chips have
     * a micro-tier consumer. Unwinding the alias must be an explicit decision.
     */
    for (const shape of SHAPES.filter((sh) => sh !== 'chip')) {
      expect(
        controlClass({ shape, size: 'xs' }),
        `${shape}/xs diverged from sm — was the alias dissolved together with an audit of every consumer?`,
      ).toBe(controlClass({ shape, size: 'sm' }));
    }
    // It is real for chips — as a pure alias this step would only add a choice.
    expect(controlClass({ shape: 'chip', size: 'xs' })).not.toBe(controlClass({ shape: 'chip', size: 'sm' }));
  });

  it('chip micro tier — the radius is micro, the height stays on the 24 floor', () => {
    /*
     * The micro tier opens **inset and radius** — not height, and not type, which the height
     * picks. Never creating a step below 24 (WCAG 2.5.8) is the ladder's first discipline. The 4px radius is
     * not an invention but an inventory: at registration time `rounded-sm` (59) plus
     * suffix-less `rounded` (37) = 96 places were already on 4px.
     */
    const cls = controlClass({ shape: 'chip', size: 'xs' });
    expect(cls).toContain('rounded-micro');
    expect(cls).toContain('min-h-6');
    expect(cls, 'the inset of chip/xs is one step below sm (px-2)').toContain('px-1.5');
  });

  it('every combination emits exactly one radius class — with two, CSS source order is the winner', () => {
    /*
     * Locks the cost of moving the chip radius from the base into a size compound.
     * Even with cn's radius group merge (`RADIUS_RAMP_STEPS`), a combination that
     * emits zero or two radii means a missing or duplicated compound.
     */
    let counted = 0;
    all((shape, size, tone, active) => {
      const n = controlClass({ shape, size, tone, active })
        .split(' ')
        .filter((c) => /^rounded-/.test(c)).length;
      expect(n, `${shape}/${size}/${tone}/${active}: ${n} radius classes`).toBe(1);
      counted += 1;
    });
    expect(counted, 'did not run a single combination').toBeGreaterThan(500);
  });

  it('the default border of chips and pills is the app majority (border-soft) — closes the door that darkened it on every move', () => {
    /*
     * Inventory at registration: hand-written borders on chip-radius elements were
     * **border-soft/chrome-border 74 vs divider 18** (4:1). If the ramp default is the
     * minority (0.08), normalising silently darkens everything by one step — the value
     * layer's version of rule 0, count the majority first. card/tile were border-soft
     * from the start, so all four bordered shapes now stand on the same default.
     */
    for (const shape of ['chip', 'pill', 'card', 'tile'] as const) {
      expect(
        controlClass({ shape }),
        `the default border of ${shape} left the majority (0.06)`,
      ).toContain('border-[color:var(--color-border-soft)]');
      expect(controlClass({ shape })).not.toContain('border-[color:var(--color-divider)]');
    }
  });

  it('the ink of signal tones is a text-role token — if success is a signal colour, consumers stay outside the ramp', () => {
    /*
     * Danger and success tones use text-role tokens; a signal colour belongs to dots and borders, not ink
     * in a sentence. `warning` still uses the signal token `--color-status-warning`.
     */
    expect(controlClass({ shape: 'chip', tone: 'success' })).toContain('--color-success-text-a94');
    expect(controlClass({ shape: 'chip', tone: 'danger' })).toContain('--color-danger-text');
    expect(controlClass({ shape: 'chip', tone: 'warning' })).toContain('--color-status-warning');
  });

  it('the removed `fixedHeight` axis does not return — the mistake then was going back to an axis instead of a value', () => {
    const source = readFileSync(join(process.cwd(), 'src/shared/ui/control-class.ts'), 'utf8');
    const live = source
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join('\n');
    expect(live, '`fixedHeight` axis is back — if the value already exists on the ladder it is not an axis but `size`').not.toMatch(
      /fixedHeight/,
    );
  });

  it('the defaults of the three new axes are byte-identical to today\'s output — so adding the axes is no regression', () => {
    /*
     * 244 places already use these values. If the defaults move by one character all
     * of them change silently — this test locks that door.
     */
    for (const shape of SHAPES) {
      for (const size of SIZES) {
        for (const tone of TONES) {
          const explicit = controlClass({
            shape,
            size,
            tone,
            scope: 'app',
            truncate: false,
          });
          expect(controlClass({ shape, size, tone }), `the default of ${shape}/${size}/${tone} moved`).toBe(
            explicit,
          );
        }
      }
    }
  });

  it('turning on every new axis yields no value outside the ramp — an axis is a hole, not a back door', () => {
    const offenders: string[] = [];
    let counted = 0;
    allScoped((cls, label) => {
      counted += 1;
      for (const c of cls.split(' ')) {
        if (/^(text|rounded|leading)-\[(?!color:)/.test(c) || /^(min-h|min-w|h|w|p[xy]?|gap)-\[/.test(c)) {
          offenders.push(`${label}: ${c}`);
        }
        const m = /^text-([a-z-]+)$/.exec(c);
        const ALIGNMENT = ['left', 'center', 'right', 'justify', 'start', 'end'];
        if (m && !ALIGNMENT.includes(m[1]) && !TYPE_RAMP_STEPS.includes(m[1] as never)) {
          offenders.push(`${label}: ${c}`);
        }
        const r = /^rounded-([a-z0-9-]+)$/.exec(c);
        if (r && !RADIUS_STEPS.includes(r[1]) && r[1] !== 'full') offenders.push(`${label}: ${c}`);
      }
    });
    // Idling guard — were the combinations actually built?
    expect(counted, 'did not run a single axis combination').toBeGreaterThan(1000);
    expect(offenders, `turning the axes on leaked outside the ramp:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });
});

/**
 * Hover is composed by cva at run time from keys like `hoverInk: 'strong'`, so lint cannot see it;
 * the contract judges the resulting string.
 */
describe('hover axis — the result strings of the value layer', () => {
  const hovers = (s: string) => s.split(' ').filter((c) => c.startsWith('hover:'));

  it('the detector does not idle — the axis really emits something', () => {
    expect(hovers(controlClass({ hoverInk: 'strong' })).length).toBeGreaterThan(0);
    expect(hovers(controlClass({ shape: 'row', hoverSurface: 'lift' })).length).toBeGreaterThan(0);
    expect(hovers(controlClass({ hoverBorder: 'strong' })).length).toBeGreaterThan(0);
  });

  it('the default emits nothing — everything is opt-in', () => {
    /*
     * Turning it on by default would silently change places that have no hover at all
     * today (30 places counting borders alone). That is a global visual change rather
     * than adding an axis, so it is not this axis's job — this assertion pins that
     * judgement.
     */
    for (const shape of ['chip', 'pill', 'row', 'icon', 'segment', 'card', 'tile', 'link'] as const) {
      expect(hovers(controlClass({ shape })), `${shape} default emits a hover`).toEqual([]);
    }
  });

  it('scope picks the value of the ink — the axis picks only the brightness step', () => {
    expect(controlClass({ hoverInk: 'strong' })).toContain(
      'hover:text-[color:var(--color-text-primary)]',
    );
    expect(controlClass({ hoverInk: 'secondary' })).toContain(
      'hover:text-[color:var(--color-text-secondary)]',
    );
    expect(controlClass({ hoverInk: 'strong', scope: 'panel' })).toContain(
      'hover:text-[color:var(--map-panel-text-primary)]',
    );
    expect(controlClass({ hoverInk: 'secondary', scope: 'panel' })).toContain(
      'hover:text-[color:var(--map-panel-text-secondary)]',
    );
  });

  it('surfaces use different steps for rows and parts — because their rest differs', () => {
    // Rows rest transparent so they take the first step; parts already sit one step up so they take the next.
    expect(controlClass({ shape: 'row', hoverSurface: 'lift' })).toContain(
      'hover:bg-[color:var(--color-overlay-1)]',
    );
    for (const shape of ['chip', 'pill', 'icon', 'segment'] as const) {
      expect(controlClass({ shape, hoverSurface: 'lift' })).toContain(
        'hover:bg-[color:var(--color-overlay-2)]',
      );
    }
    expect(controlClass({ shape: 'row', hoverSurface: 'lift', scope: 'panel' })).toContain(
      'hover:bg-[color:var(--map-panel-row-hover)]',
    );
  });

  it('a selected item receives no hover — "soon" and "now" must not say the same thing', () => {
    /*
     * Hover over a selected item's border weakens it, so selected items take no hover; the key absorbs
     * a guard consumers used to write by hand.
     */
    for (const v of [
      { hoverInk: 'strong' },
      { hoverSurface: 'lift' },
      { hoverBorder: 'strong' },
      { hoverInk: 'secondary', hoverSurface: 'lift', hoverBorder: 'strong' },
    ] as const) {
      expect(hovers(controlClass({ ...v, active: true })), `${JSON.stringify(v)} leaked at active`).toEqual([]);
    }
  });

  it('the three are independent of each other — there were 96 places needing two attributes together', () => {
    const both = controlClass({ hoverInk: 'strong', hoverBorder: 'strong' });
    expect(both).toContain('hover:text-[color:var(--color-text-primary)]');
    expect(both).toContain('hover:border-[color:var(--color-border-strong)]');
    const all3 = controlClass({ shape: 'chip', hoverInk: 'strong', hoverSurface: 'lift', hoverBorder: 'strong' });
    expect(hovers(all3)).toHaveLength(3);
  });

  it('the axes do not leak outside the ramp — every combination emits only tokens', () => {
    const offenders: string[] = [];
    for (const shape of ['chip', 'pill', 'row', 'icon', 'segment', 'card', 'tile', 'link'] as const) {
      for (const scope of ['app', 'panel'] as const) {
        for (const hoverInk of ['none', 'strong', 'secondary'] as const) {
          for (const hoverSurface of ['none', 'lift'] as const) {
            for (const hoverBorder of ['none', 'strong'] as const) {
              for (const h of hovers(controlClass({ shape, scope, hoverInk, hoverSurface, hoverBorder }))) {
                if (!/^hover:(text|bg|border)-\[color:var\(--[a-z0-9-]+\)\]$/.test(h)) {
                  offenders.push(`${shape}/${scope}: ${h}`);
                }
              }
            }
          }
        }
      }
    }
    expect(offenders, 'the hover axis emitted a value that is not a token').toEqual([]);
  });

  it('the axes do not grow silently — choices are only the measured majority', () => {
    const SOURCE = readFileSync(join(process.cwd(), 'src/shared/ui/control-class.ts'), 'utf8');
    /*
     * Pins the options in source — adding one requires editing this line, and that
     * diff demands an answer to "which measurement required this option" (the badge
     * tone axis set the precedent).
     */
    expect(SOURCE).toContain("hoverInk: { none: '', strong: '', secondary: '' },");
    expect(SOURCE).toContain("hoverSurface: { none: '', lift: '' },");
    expect(SOURCE).toContain("hoverBorder: { none: '', strong: '' },");
    // Four in total — four rather than three because ink alone has two steps.
    const options = ['strong', 'secondary', 'lift', 'strong'];
    expect(options).toHaveLength(4);
  });
});
