import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The map's utility rail names itself as one group.**
 *
 * Four icon-only tiles (fit · tour · shortcuts · replay) sat on the right edge of
 * `/topology`, each with its own tooltip. Reading the rail therefore cost one hover
 * and one wait per tile, and a keyboard user got no names at all — a tooltip on a
 * `title` attribute is a pointer affordance.
 *
 * Measured in the browser at 1440×900 after the change (dev server, 2026-09-05):
 *
 * | State | tile width | label opacity |
 * |---|---|---|
 * | rest | 36 × 36 — exactly `--chrome-tile-size` | 0 |
 * | pointer over any one tile | 122 / 104 / 161 / 141 | 1 on **all four** |
 * | keyboard focus on any one tile | same | 1 on **all four** |
 * | `prefers-reduced-motion` | same widths, `transition-duration 0.01ms` | 1 |
 *
 * The rendered behaviour is proved by `tests/e2e/map-rail-labels.spec.ts`. This file
 * holds the parts a rendered check cannot see: that the collapsed geometry comes from
 * the token rather than a coincidence, that the keyboard half of the reveal was not
 * dropped, and that no literal duration crept into the transition.
 */

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

/** The rule body for a selector, brace-matched so a nested block cannot truncate it. */
function ruleBody(selectorFragment: string): string {
  const at = CSS.indexOf(selectorFragment);
  expect(at, `${selectorFragment} is not in app/globals.css`).toBeGreaterThan(-1);
  const open = CSS.indexOf('{', at);
  let depth = 0;
  let i = open;
  for (; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return CSS.slice(open + 1, i);
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const REST = ruleBody('.chrome-tile-label {');
const REVEAL = ruleBody('.chrome-rail:hover .chrome-tile-label,');

describe('chrome rail label contract', () => {
  it('rests clipped to zero, so the collapsed tile can measure the chrome token', () => {
    expect(REST).toMatch(/max-width:\s*0\s*;/);
    expect(REST).toMatch(/opacity:\s*0\s*;/);
    expect(REST).toMatch(/overflow:\s*hidden\s*;/);
    // Without this the label wraps instead of being clipped, and the tile grows in
    // height rather than width — the one axis the chrome contract fixes.
    expect(REST).toMatch(/white-space:\s*nowrap\s*;/);
  });

  it('spends the icon-to-label distance as a margin, never as a flex gap', () => {
    // A flex `gap` on the tile counts even while the label is clipped to zero, so the
    // collapsed tile would measure 44px against a 36px contract. The margin starts at
    // zero and is transitioned with the width, which a `gap` cannot be.
    expect(REST).toMatch(/margin-inline-start:\s*0\s*;/);
    expect(REVEAL).toMatch(/margin-inline-start:\s*var\(--chrome-tile-label-gap\)/);
    const tile = readFileSync(path.join(ROOT, 'src/shared/ui/chrome-tile.tsx'), 'utf8');
    expect(tile).not.toMatch(/(['"\s])gap-\d/);
  });

  it('reveals on focus as well as hover — the keyboard half is the easy one to drop', () => {
    const selector = CSS.slice(
      CSS.indexOf('.chrome-rail:hover .chrome-tile-label,'),
      CSS.indexOf('{', CSS.indexOf('.chrome-rail:hover .chrome-tile-label,')),
    );
    expect(selector).toContain(':hover');
    expect(selector).toContain(':focus-within');
    // Both arms are the same rule, so they cannot expand different properties.
    expect(REVEAL).toMatch(/max-width:\s*var\(--chrome-tile-label-max\)/);
    expect(REVEAL).toMatch(/opacity:\s*1\s*;/);
  });

  it('scopes hover and focus to the group, not the tile', () => {
    // `.chrome-tile-label:hover` would name one tile under the cursor — the jumping
    // single label this replaced. The ancestor is what makes it one semantic group.
    expect(CSS).not.toMatch(/\.chrome-tile-label:(hover|focus)/);
  });

  it('rides the motion ramp — no literal duration in the reveal', () => {
    const transition = REST.slice(REST.indexOf('transition:'));
    expect(transition).toMatch(/var\(--motion-base\)/);
    expect(transition).toMatch(/var\(--motion-fast\)/);
    expect(transition).toMatch(/var\(--motion-ease\)/);
    expect(
      transition.slice(0, transition.indexOf(';')),
      'a literal time in the transition is off the ramp where no lint rule looks',
    ).not.toMatch(/\d+m?s\b/);
  });

  it('reduced motion keeps the reveal and drops only the growth', () => {
    // The global kill rule cuts every transition to 0.01ms, which is exactly the
    // wanted equivalent here: the label still appears, the box no longer grows. A
    // carve-out that gave this class its time back would restore the moving axis, so
    // the absence of one is the contract.
    expect(CSS).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    const reducedBlocks = CSS.split('@media (prefers-reduced-motion: reduce)').slice(1);
    expect(reducedBlocks.length).toBeGreaterThan(0);
    for (const block of reducedBlocks) {
      expect(block.slice(0, block.indexOf('\n}\n') + 1)).not.toContain('chrome-tile-label');
    }
  });

  it('the group class has consumers — a rule nobody applies is misinformation', () => {
    const users = sourceFiles(path.join(ROOT, 'src')).filter((file) =>
      /\bchrome-rail\b/.test(readFileSync(file, 'utf8')),
    );
    expect(users.length, 'no source applies .chrome-rail').toBeGreaterThan(0);

    // The rail is four tiles — fit, tour, shortcuts, replay. Counting them rather
    // than the files that hold them keeps the check honest when two of the four live
    // in the same view, which is the shape today.
    const labelled = sourceFiles(path.join(ROOT, 'src'))
      .filter((file) => !file.endsWith('.test.tsx'))
      .reduce(
        (total, file) =>
          total + (readFileSync(file, 'utf8').match(/<ChromeTile[\s\S]{0,400}?\blabel=/g)?.length ?? 0),
        0,
      );
    expect(labelled, 'the rail lost a labelled tile').toBeGreaterThanOrEqual(4);
  });
});
