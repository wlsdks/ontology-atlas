import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { locateGlobalCssLine, readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Every step of the type ramp must follow the root font size, because browser text-only zoom changes
 * only the root. A `px` ramp is immune to it. The unit leaves no value to see, so this reads the
 * declaration.
 */
const ROOT = process.cwd();
const CSS = readGlobalCss();

/** Every `.ts`/`.tsx` under `src/` and `app/` — the two directories the ramp lint covers. */
function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'data') continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry)) {
        found.push(full);
      }
    }
  };
  for (const dir of ['src', 'app']) walk(path.join(ROOT, dir));
  return found;
}

/** Comments are blanked so a px value quoted in prose cannot read as a declaration. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));

interface Declaration {
  readonly name: string;
  readonly value: string;
  readonly line: number;
}

function declarations(prefix: 'text' | 'leading'): Declaration[] {
  const found: Declaration[] = [];
  // ⚠️ `(?:^|[{;])` rather than `^`: a one-line scoped override — `[data-dense] { --text-body:
  // 12px; }` — puts the declaration after a brace on the same line, and an anchor that only
  // knows the line start walks straight past it. Nothing formats `app/globals.css` (no
  // prettier or stylelint in `package.json`), so that spelling is a live possibility rather
  // than a hypothetical. The fourth self-probe below plants exactly that line.
  const pattern = new RegExp(`(?:^|[{;])[ \\t]*(--${prefix}-[a-z0-9-]+)\\s*:\\s*([^;{}]+);`, 'gm');
  for (const match of CODE.matchAll(pattern)) {
    // The `--text-<step>--line-height` companions are pointers at a `--leading-*` step, not
    // sizes of their own; the step they point at is checked on its own row.
    if (match[1].endsWith('--line-height')) continue;
    found.push({
      name: match[1],
      value: match[2].trim(),
      line: CODE.slice(0, match.index).split('\n').length,
    });
  }
  return found;
}

/**
 * The steps that are deliberately **not** root-relative, each with the reason written beside
 * the token in `app/globals.css`. A new name may only be added here with that reason and a
 * `docs/DECISIONS.md` record — the list is short on purpose.
 */
const NOT_ROOT_RELATIVE = new Map<string, string>([
  [
    '--text-monument',
    'clamp(2.5rem, 4.8cqw, 96px) — a three-armed size, so no single unit describes it. Its ' +
      'floor IS root-relative (the reader\'s guarantee, and `2.5rem` is the same 40px it was); ' +
      'the `4.8cqw` term answers to its own container, which text zoom cannot reach at all; ' +
      'the `96px` ceiling is the layout\'s limit, not the reader\'s',
  ],
  ['--leading-display-tight', 'a ratio — it already follows the size it is applied to'],
  ['--leading-prose', 'a ratio — it already follows the size it is applied to'],
  ['--leading-monument', 'a ratio — it already follows the size it is applied to'],
]);

describe('the type ramp follows the root font size', () => {
  it('the detector really reads the ramp, so an empty scan is a defect rather than a pass', () => {
    // If the path or the pattern drifts, every assertion below goes green over an empty set.
    expect(declarations('text').length).toBeGreaterThanOrEqual(9);
    expect(declarations('leading').length).toBeGreaterThanOrEqual(11);
  });

  it.each(['text', 'leading'] as const)(
    'every step of --%s-* is rem, since browser text zoom does not reach px',
    (prefix) => {
      const offenders = declarations(prefix)
        .filter((entry) => !NOT_ROOT_RELATIVE.has(entry.name))
        .filter((entry) => !/^[0-9.]+rem$/.test(entry.value))
        .map((entry) => {
          const at = locateGlobalCssLine(entry.line);
          return `  ${at.file}:${at.line}  ${entry.name}: ${entry.value}`;
        });

      expect(
        offenders,
        'A ramp step is not relative to the root. Written in px, the browser setting that enlarges\n' +
          'text only never reaches this step (2026-09-11 U2 carry-forward: at 200% the\n' +
          'screen was identical pixel for pixel). Divide by the 16px root and write rem:\n' +
          '9.5px is 0.59375rem. If a step must stand outside the ramp, register it with the reason\n' +
          'in NOT_ROOT_RELATIVE in this file and record it in docs/DECISIONS.md.\n' +
          'Violations:\n' +
          offenders.join('\n'),
      ).toEqual([]);
    },
  );

  it('the exception list holds only tokens that exist, since a dead exception is misinformation rather than a spec', () => {
    const names = new Set([
      ...declarations('text').map((entry) => entry.name),
      ...declarations('leading').map((entry) => entry.name),
    ]);
    const dead = [...NOT_ROOT_RELATIVE.keys()].filter((name) => !names.has(name));
    expect(dead, 'the exception list still holds a token that no longer exists').toEqual([]);
  });

  it('an exception does not quietly turn into rem, and if it changes it is a step rather than an exception', () => {
    // The other direction: if a documented exception becomes a plain `rem` value, its reason no longer
    // describes it and the entry must leave this list.
    const all = [...declarations('text'), ...declarations('leading')];
    const stale = all
      .filter((entry) => NOT_ROOT_RELATIVE.has(entry.name))
      .filter((entry) => /^[0-9.]+rem$/.test(entry.value))
      .map((entry) => `  ${entry.name}: ${entry.value}`);
    expect(stale, 'a step registered as an exception became plain rem; take it off the list').toEqual([]);
  });

  it('a one-line scope override is caught too, since a declaration after a brace is a declaration', () => {
    // The anchor's own probe: the same declaration, written after a brace on one line. An
    // earlier version of this detector reported it as absent, which is the quietest way for a
    // ramp step to come back to `px`.
    const oneLine = '[data-dense] { --text-body: 12px; }';
    const pattern = /(?:^|[{;])[ \t]*(--text-[a-z0-9-]+)\s*:\s*([^;{}]+);/gm;
    const found = [...oneLine.matchAll(pattern)].map((m) => `${m[1]}: ${m[2].trim()}`);
    expect(found).toEqual(['--text-body: 12px']);
  });

  it('type size tokens outside the prefix follow the root too, since the prefix must not become the spec', () => {
    // `--text-*` is a naming convention, not the quantity: a size token under any other name consumed
    // through `text-[length:var(...)]` is still type. The detector reads consumers, not names.
    const sources = sourceFiles();
    expect(sources.length, 'the scan is empty; found no consumer in src/app').toBeGreaterThan(50);
    const consumed = new Set<string>();
    for (const file of sources) {
      const body = readFileSync(file, 'utf8');
      for (const match of body.matchAll(/text-\[length:var\((--[a-z0-9-]+)\)\]/g)) {
        consumed.add(match[1]);
      }
    }
    expect(consumed.size, 'consumer scan is 0, so the regex has drifted').toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const name of [...consumed].sort()) {
      // A token that points at a ramp step inherits the ramp's unit by construction.
      const declaration = CODE.match(
        new RegExp(`(?:^|[{;])[ \\t]*${name}\\s*:\\s*([^;{}]+);`, 'm'),
      );
      if (!declaration) continue;
      const value = declaration[1].trim();
      if (/var\(--text-/.test(value)) continue;
      if (/^[0-9.]+rem$/.test(value)) continue;
      if (/^calc\(.*var\(--text-/.test(value)) continue;
      offenders.push(`  ${name}: ${value}`);
    }
    expect(
      offenders,
      'A size token consumed through `text-[length:var(…)]` does not follow the root.\n' +
        'The quantity sets the rule, not the prefix: write it in rem or point it at\n' +
        'a var(--text-*). Violations:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('the value read is a declaration rather than a comment, so px written in prose does not fool it', () => {
    // Self-probe for the comment blanking: the file is full of prose citing `9.5px` and `14px`,
    // and a detector that read those would report offenders that do not exist (or, worse, find
    // a "declaration" in a history note and pass on it).
    expect(CSS).toContain('9.5px');
    const quotedInCode = declarations('text').filter((entry) => entry.value === '9.5px');
    expect(quotedInCode).toEqual([]);
  });
});
