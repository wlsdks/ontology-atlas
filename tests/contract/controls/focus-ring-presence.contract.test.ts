import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { controlClass } from '../../../src/shared/ui/control-class';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/** A comment is not a value — a trap stepped on four times in this round. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Terminates an opening tag by brace depth — steps over multi-line tags and callbacks. */
function openingTag(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from, from + 3000);
}

function collectTsx(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
        continue;
      }
      if (!/\.tsx$/.test(name) || name.includes('.test.')) continue;
      out.push(p);
    }
  };
  for (const root of ['src', 'app']) walk(path.join(process.cwd(), root));
  return out;
}

/**
 * Keyboard focus ring comes from the value layer and shows only after a real tab press, so a DOM
 * sweep cannot see it. The value layer emits strings, so combinations are assembled here instead.
 */

const ROOT = process.cwd();
const RING = 'focus-visible:ring-';
/** `outline-hidden` turns the outline off but keeps it under `forced-colors`, where a ring is not painted. */
const OUTLINE_OFF = 'focus-visible:outline-hidden';
/** Either spelling turns the browser ring off, so the scan below reads both. */
const TURNS_OUTLINE_OFF = /focus-visible:outline-(?:none|hidden)\b/;

const SHAPES = ['chip', 'icon', 'row', 'link', 'pill', 'card'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;

describe('keyboard focus — the base layer lays the floor and the value layer builds on it', () => {
  /**
   * The floor is the base rule in `globals.css`: `:where()` gives specificity 0 and
   * `outline-offset: -2px` keeps box size. Both checks are needed: floor alone hides a value layer
   * that lost its ring; value layer alone leaves bypassing elements bare.
   */
  it('the base layer lays a focus floor on every interactive element', () => {
    const css = readGlobalCss();
    const rule = /:where\(([\s\S]{0,400}?)\):focus-visible\s*\{([\s\S]{0,200}?)\}/.exec(css);
    expect(rule, 'the `:where(...):focus-visible` floor rule in globals.css disappeared').not.toBeNull();

    const selector = rule![1];
    for (const needed of ['button', 'summary', 'a[href]', 'role="button"', 'tabindex']) {
      expect(selector, `the focus floor does not cover ${needed}`).toContain(needed);
    }
    // Programmatically moved focus (a modal container) must be excluded. `toContain('-1')` is not enough:
    // it passes while `-1` appears anywhere in the selector.
    expect(
      selector.replace(/\s+/g, ''),
      'unless tabindex="-1" is exempted, a ring is also drawn on programmatically moved focus (modal container)',
    ).toContain('[tabindex]:not([tabindex="-1"])');

    const body = rule![2];
    expect(body, 'the floor does not draw an outline').toMatch(/outline:\s*2px/);
    expect(body, 'unless drawn inward the box size changes and it overlaps neighbours').toMatch(/outline-offset:\s*-/);
    expect(body, 'the focus colour is not of the indigo lineage').toMatch(/--color-indigo/);
  });

  it('every shape × size combination carries a focus ring', () => {
    const missing: string[] = [];
    for (const shape of SHAPES) {
      for (const size of SIZES) {
        let out = '';
        try {
          out = controlClass({ shape, size } as Parameters<typeof controlClass>[0]);
        } catch {
          continue; // No such combination means it is outside this contract
        }
        if (!out.includes(RING) || !out.includes(OUTLINE_OFF)) missing.push(`${shape}/${size}`);
      }
    }
    expect(
      missing,
      'When the value layer emits no focus ring, the browser default (the OS accent colour) is drawn,\n' +
        'which is outside the charter of neutrals plus one indigo. Check the FOCUS constant in `control-class.ts`.\n' +
        `Missing: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the focus ring colour is of the indigo lineage — no new colour enters', () => {
    const out = controlClass({ shape: 'chip', size: 'md' });
    const ring = /focus-visible:ring-\[color:var\((--[a-z0-9-]+)\)\]/.exec(out);
    expect(ring, 'the focus ring does not reference a token').not.toBeNull();
    expect(
      ring![1],
      `the focus ring must be of the indigo lineage — now ${ring![1]}`,
    ).toMatch(/indigo/);
  });

  it('the ring is inset — in dense rows it does not overlap neighbours and does not change the box size', () => {
    expect(controlClass({ shape: 'row', size: 'md' })).toContain('focus-visible:ring-inset');
  });

  /**
   * A consumer turning off the browser ring with `outline-hidden` and giving no replacement leaves focus
   * invisible (WCAG 2.4.7). Scope is the opening tag; a border change counts as an indicator and
   * `tabIndex={-1}` containers are exempt because a ring there is the defect.
   */
  it('no spot only turns focus off and gives no indication', () => {
    const files = collectTsx();
    expect(files.length, 'the scan is empty — a gate on an empty set is not a gate').toBeGreaterThan(150);

    /** Legitimate focus indicators other than a ring — border, background, or shadow changes. */
    const ANY_INDICATOR = /focus-visible:(ring-|border-|bg-|shadow-|text-)/;
    const offenders: string[] = [];
    let scannedTags = 0;

    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/<[a-zA-Z][a-zA-Z0-9.]*\b/g)) {
        const tag = openingTag(src, m.index ?? 0);
        if (!TURNS_OUTLINE_OFF.test(tag)) continue;
        scannedTags += 1;
        // For programmatically moved focus (modal and panel containers) a ring is the defect
        if (/tabIndex=\{-1\}/.test(tag)) continue;
        if (ANY_INDICATOR.test(tag)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${path.relative(ROOT, f)}:${line}`);
      }
    }

    expect(scannedTags, 'could not find a single tag using `outline-hidden` — the detector is dead').toBeGreaterThan(50);
    expect(
      offenders,
      '`focus-visible:outline-hidden` **only removes** the default browser ring. Without a replacement\n' +
        '(one of ring, border, bg or shadow) focus is not visible at all (WCAG 2.4.7).\n' +
        `Violations: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('probe — the detector really bites', () => {
    const scan = (body: string): string[] => {
      const src = stripComments(body);
      const out: string[] = [];
      for (const m of src.matchAll(/<[a-zA-Z][a-zA-Z0-9.]*\b/g)) {
        const tag = openingTag(src, m.index ?? 0);
        if (!TURNS_OUTLINE_OFF.test(tag)) continue;
        if (/tabIndex=\{-1\}/.test(tag)) continue;
        if (/focus-visible:(ring-|border-|bg-|shadow-|text-)/.test(tag)) continue;
        out.push('hit');
      }
      return out;
    };
    // Violation — turned off with nothing in its place
    expect(scan('<button className="focus-visible:outline-hidden" />')).toHaveLength(1);
    expect(scan('<button className="focus-visible:outline-none" />')).toHaveLength(1);
    // Legitimate — ring, border, programmatic container
    expect(scan('<button className="focus-visible:outline-hidden focus-visible:ring-2" />')).toEqual([]);
    expect(scan('<input className="focus-visible:outline-hidden focus-visible:border-x" />')).toEqual([]);
    expect(scan('<div tabIndex={-1} className="focus-visible:outline-hidden" />')).toEqual([]);
    // A quotation inside a comment is not a value
    expect(scan('// <button className="focus-visible:outline-hidden" />\nconst a = 1;')).toEqual([]);
  });
});
