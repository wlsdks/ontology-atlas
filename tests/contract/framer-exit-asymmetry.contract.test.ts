import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { EXIT_TRANSITION, MOTION } from '../../src/shared/motion';

/**
 * Framer half of the exit contract: `AnimatePresence` exits sit outside the CSS scanner. The lockout
 * lives in `useExitLockout` (`src/shared/motion/use-exit-lockout.ts`), not in the exit set: a string
 * value there stalls `AnimatePresence` under jsdom. So every `exit` prop needs `onAnimationStart`.
 */

const SRC = path.join(process.cwd(), 'src');

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      tsxFiles(full, acc);
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) acc.push(full);
  }
  return acc;
}

/**
 * Every **exit target written as a literal**, brace-matched.
 *
 * Three details, each one a way an earlier scanner in this repository went blind:
 *
 * 1. **Brace matching, not `}}`.** An exit target now contains an object of its own
 *    (`transition: { … }`), so a non-greedy `}}` reads half of it and then reports the
 *    transition as missing.
 * 2. **`exit:` as well as `exit=`.** `ShortcutSheet` builds its reduced-motion and full
 *    variants as a `{ initial, animate, exit, transition }` object and passes
 *    `exit={surfaceMotion.exit}`. A JSX-only scanner would have declared that file clean
 *    while both of its exit targets were untouched.
 * 3. **A reference is not a target.** `exit={surfaceMotion.exit}` carries no values to
 *    judge; the literal it points at is judged where it is written. Anything whose body
 *    is a bare identifier or member expression is skipped for that reason — not because
 *    it is exempt.
 */
function exitProps(source: string): string[] {
  const found: string[] = [];
  const re = /\bexit\s*[:=]\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = source.slice(m.index, i + 1);
    const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'));
    if (/^[\s{]*[A-Za-z_$][\w.$]*[\s}]*$/.test(inner)) continue;
    found.push(body);
  }
  return found;
}

/**
 * Every `<motion.*` **opening tag**, brace/quote/string matched so a `>` inside a JS
 * expression attribute (a ternary, a generic type argument, a string) does not
 * prematurely close the tag. Judging wiring from the tag — not from the exit literal —
 * is what lets a reference form (`exit={surfaceMotion.exit}`) be judged at all: the
 * literal it points at carries no JSX to inspect, but the tag that spreads it does.
 */
function jsxOpenTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<motion\.[A-Za-z][\w]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index + m[0].length;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === quote && source[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth <= 0) {
        i += 1;
        break;
      }
    }
    tags.push(source.slice(m.index, i));
  }
  return tags;
}

const files = tsxFiles(SRC)
  .map((file) => ({ file: path.relative(process.cwd(), file), source: readFileSync(file, 'utf8') }))
  .map((entry) => ({ ...entry, exits: exitProps(entry.source), tags: jsxOpenTags(entry.source) }))
  .filter((entry) => entry.exits.length > 0 || entry.tags.some((tag) => /\bexit\s*=/.test(tag)));

const allExits = files.flatMap((entry) => entry.exits.map((exit) => ({ file: entry.file, exit })));

/** Every `<motion.*` tag that carries an `exit=` attribute, literal or by reference. */
const allExitTags = files.flatMap((entry) =>
  entry.tags
    .filter((tag) => /\bexit\s*=/.test(tag))
    .map((tag) => ({ file: entry.file, tag })),
);

describe('framer exit asymmetry contract', () => {
  it('finds the AnimatePresence exits — an empty scan is not a pass', () => {
    // A drop means a surface lost its exit or the scanner went blind.
    expect(allExits.length, `only ${allExits.length} exit props found — the scanner is idling`).toBeGreaterThanOrEqual(20);
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it('an exit is not the entrance clock played backwards — every exit names its own transition', () => {
    const offenders = allExits
      .filter(({ exit }) => !/\btransition\s*:/.test(exit))
      .map(({ file, exit }) => `${file} → ${exit.replace(/\s+/g, ' ')}`);
    expect(
      offenders,
      `exit inherits the element's entry transition (same duration, same curve):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('every exit transition is the shared EXIT_TRANSITION, not a fresh literal', () => {
    const offenders = allExits
      .filter(({ exit }) => !/\btransition\s*:\s*EXIT_TRANSITION\b/.test(exit))
      .map(({ file, exit }) => `${file} → ${exit.replace(/\s+/g, ' ')}`);
    expect(
      offenders,
      `an exit duration written inline drifts off the ramp where no gate looks:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('a surface that leaves stops taking input from its first exit frame', () => {
    // Judged per **tag**, not per literal or per file. The lockout is imperative
    // (`useExitLockout`'s `onAnimationStart` checks the definition's `transition`
    // identity against `EXIT_TRANSITION`), so the invariant a static scanner can check is
    // "the element carrying `exit=` also carries `onAnimationStart=`" — not a value
    // inside the exit object itself, which is exactly the shape that hung CI (see the
    // file doc-block).
    expect(allExitTags.length, 'no <motion.*> tag with an exit= prop was found — the scanner is idling').toBeGreaterThanOrEqual(15);
    const offenders = allExitTags
      .filter(({ tag }) => !/\bonAnimationStart\s*=/.test(tag))
      .map(({ file, tag }) => `${file} → ${tag.split('\n')[0].trim()}…`);
    expect(
      offenders,
      `a disappearing surface still swallows the click that lands on it (no onAnimationStart lockout wiring):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('EXIT_TRANSITION is the CSS exit formula, on the ramp', () => {
    // `calc(var(--motion-base) * 0.67)` is what every CSS exit in globals.css already
    // uses; 180 × 0.67 = 120.6 ms, which is the ramp's fast step. So the JS mirror adds
    // no off-ramp value — it reuses the step the formula lands on.
    expect(EXIT_TRANSITION.duration).toBeCloseTo(MOTION.fast.duration, 6);
    expect(EXIT_TRANSITION.duration).toBeLessThan(MOTION.base.duration);
    expect(Math.abs(EXIT_TRANSITION.duration - MOTION.base.duration * 0.67)).toBeLessThan(0.005);
  });

  it('EXIT_TRANSITION carries no non-numeric animatable value', () => {
    // The CI finding in one sentence: a string value in the framer exit set (even one
    // whose own transition is zero-duration) stalls AnimatePresence completion under
    // jsdom. Keeping this object to `{ duration, ease }` is what makes that impossible to
    // reintroduce by editing this file alone — the lockout lives in useExitLockout
    // instead.
    expect(Object.keys(EXIT_TRANSITION).sort()).toEqual(['duration', 'ease']);
  });
});
