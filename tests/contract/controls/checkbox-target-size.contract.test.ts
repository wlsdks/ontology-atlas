import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Native checkboxes and radios need a 24x24 target (WCAG 2.5.8): the input itself, or a wrapping
 * `<label>` with a 24px floor. Reads source only; the rendered rect belongs to
 * `tests/e2e/gateway/touch-target-contract.spec.ts`.
 */

const ROOT = join(__dirname, '..', '..', '..');
const ROOTS = [join(ROOT, 'src'), join(ROOT, 'app')];

/** Tailwind's `size-N`/`h-N` are in 0.25rem units — 24px is `6`. */
const AA_MIN_PX = 24;
const TAILWIND_STEP_PX = 4;

/** Markers indicating a label carries the floor. `.atlas-touch-floor` is coarse-only, so it cannot satisfy AA alone. */
const AA_FLOOR_CLASS = /\bmin-h-(\d+(?:\.\d+)?)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (/\.test\.|\.spec\./.test(name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Strip comments. **This repository hit this defect four times in 2026-08 alone** —
 * either counting example code inside a comment as a violation (over-report) or
 * missing a real violation hidden behind one (under-report).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Reads px from `size-6`, `h-6`, `size-[24px]` and friends. null when unreadable. */
function declaredPx(className: string): number | null {
  const bracket = className.match(/\b(?:size|h)-\[(\d+(?:\.\d+)?)px\]/);
  if (bracket) return Number(bracket[1]);
  const step = className.match(/\b(?:size|h)-(\d+(?:\.\d+)?)\b/);
  if (step) return Number(step[1]) * TAILWIND_STEP_PX;
  return null;
}

type Site = {
  file: string;
  type: string;
  className: string;
  ownPx: number | null;
  labelFloorPx: number | null;
  hasCoarseFloor: boolean;
};

/**
 * Finds checkboxes/radios and reads the floor from **the opening tag of the nearest
 * enclosing `<label>`**, scanning backwards.
 *
 * Scanning backwards works without parsing JSX: "is this input inside a label" can
 * be decided by finding the nearest preceding `<label` and checking that no
 * `</label>` sits in between.
 */
/**
 * Slices from `<input` to where the tag really ends: `[^>]*` stops at the `>` of an arrow handler,
 * so brace depth is counted and only a `>` at depth 0 ends the tag.
 */
function inputTagAt(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** Extracts from a **source string** rather than a file, so synthetic probes do not depend on the real count. */
function collectFromSource(label: string, raw: string): Site[] {
  const sites: Site[] = [];
  const source = stripComments(raw);
  for (const m of source.matchAll(/<input\b/g)) {
    const tag = inputTagAt(source, m.index ?? 0);
    const typeMatch = tag.match(/type=["'](checkbox|radio)["']/);
    if (!typeMatch) continue;
    const classMatch = tag.match(/className=(?:["']([^"']*)["']|\{`([^`]*)`\})/);
    const className = classMatch?.[1] ?? classMatch?.[2] ?? '';
    sites.push({
      file: label,
      type: typeMatch[1],
      className,
      ownPx: declaredPx(className),
      labelFloorPx: null,
      hasCoarseFloor: false,
    });
  }
  return sites;
}

function collect(files: string[]): Site[] {
  const sites: Site[] = [];
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const m of source.matchAll(/<input\b/g)) {
      const tag = inputTagAt(source, m.index ?? 0);
      const typeMatch = tag.match(/type=["'](checkbox|radio)["']/);
      if (!typeMatch) continue;
      const classMatch = tag.match(/className=(?:["']([^"']*)["']|\{`([^`]*)`\})/);
      const className = classMatch?.[1] ?? classMatch?.[2] ?? '';

      const before = source.slice(0, m.index ?? 0);
      const labelOpen = before.lastIndexOf('<label');
      const labelClose = before.lastIndexOf('</label>');
      const wrapped = labelOpen !== -1 && labelOpen > labelClose;
      let labelFloorPx: number | null = null;
      let hasCoarseFloor = false;
      if (wrapped) {
        const labelTag = source.slice(labelOpen, source.indexOf('>', labelOpen) + 1);
        /*
         * The floor arrives two ways — as a literal (`min-h-6 atlas-touch-floor`) or from
         * the **value layer** (`fieldLabel({ row: true })`). Not knowing the latter makes
         * this gate **punish progress** the moment the spec moves into the value layer —
         * the failure hit twice today.
         */
        const viaValueLayer = /fieldLabel\s*\(\s*\{[^}]*\brow:\s*true/.test(labelTag);
        const floor = labelTag.match(AA_FLOOR_CLASS);
        labelFloorPx = viaValueLayer ? AA_MIN_PX : floor ? Number(floor[1]) * TAILWIND_STEP_PX : null;
        hasCoarseFloor = viaValueLayer || labelTag.includes('atlas-touch-floor');
      }
      sites.push({
        file: file.slice(ROOT.length + 1),
        type: typeMatch[1],
        className,
        ownPx: declaredPx(className),
        labelFloorPx,
        hasCoarseFloor,
      });
    }
  }
  return sites;
}

const sites = collect(ROOTS.flatMap(walk));

describe('target size of native checkboxes and radios (WCAG 2.5.8 AA)', () => {
  /**
   * Idling guard. This repository has repeatedly built gates that cannot distinguish
   * "0 because it is clean" from "0 because nothing was looked at" — if the scanner
   * goes quiet, this assertion turns red first.
   */
  /**
   * Never put a lower bound on the target count; assert the scanner is alive instead (enough files
   * scanned, a synthetic checkbox extracted).
   */
  it('the detector is alive — wide view, and it really extracts synthetic checkboxes', () => {
    expect(
      ROOTS.flatMap(walk).length,
      'too few files scanned — the scanner is blind',
    ).toBeGreaterThan(300);

    const probe = collectFromSource(
      'probe.tsx',
      '<input type="checkbox" className="size-4" onChange={(e) => go(e)} />',
    );
    expect(probe.length, 'could not extract the synthetic checkbox — the tag parser is dead').toBe(1);
    expect(probe[0].ownPx, 'could not read the size of the synthetic checkbox').toBe(16);
  });

  it.each(sites.map((s) => [`${s.file} (${s.type})`, s] as const))(
    '%s — is itself 24px or its wrapping label has a 24px floor',
    (_name, site) => {
      const ownOk = site.ownPx !== null && site.ownPx >= AA_MIN_PX;
      const labelOk = site.labelFloorPx !== null && site.labelFloorPx >= AA_MIN_PX;
      expect(
        ownOk || labelOk,
        `Own size ${site.ownPx ?? 'unset'}px · label floor ${site.labelFloorPx ?? 'none'}px. ` +
          'Grow the checkbox to 24px, or put `min-h-6` on the wrapping <label> ' +
          '(clicking the label toggles it, so the whole label is one target).',
      ).toBe(true);
    },
  );

  /**
   * With no size class at all the browser default renders (≈13px on Chromium macOS).
   * **No value is left in the code, so no value-reading lint can see it** — the form
   * edition of "what was never written leaves no trace in the code", a failure this
   * repository has hit repeatedly. `AtlasGitPanel`'s push opt-in was in exactly that
   * state.
   */
  it.each(sites.map((s) => [s.file, s] as const))(
    '%s — does not leave the size to the UA default',
    (_file, site) => {
      expect(
        site.ownPx,
        'has no size class. Browsers draw different values, and since the value is not in the code lint cannot see it either.',
      ).not.toBeNull();
    },
  );

  it('there is a floor for fingers too — spots targeted through a label also get coarse 44', () => {
    const labelTargeted = sites.filter((s) => !(s.ownPx !== null && s.ownPx >= AA_MIN_PX));
    expect(labelTargeted.length, 'if no spot is targeted through a label this assertion idles').toBeGreaterThan(0);
    const missing = labelTargeted.filter((s) => !s.hasCoarseFloor);
    expect(
      missing.map((s) => s.file),
      'AA 24 is a mouse standard. For fingers (coarse), `atlas-touch-floor` emits 44.',
    ).toEqual([]);
  });

  /**
   * Locks visual size against scattering. Before the fix the five places were 16 ·
   * 14 · 14 · 14 · UA default — the same part carrying a different value per place is
   * the defect this repository calls "50 distinct combinations".
   */
  it('the visual checkbox size converges on one value', () => {
    const sizes = [...new Set(sites.map((s) => s.ownPx))].sort();
    expect(sizes.length, `checkbox sizes diverged into ${sizes.join(' · ')}`).toBe(1);
  });
});
