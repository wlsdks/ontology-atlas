import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `<b>` and `<strong>` must state a weight, else the browser default 700 is outside the weight ramp.
 * No value is left in source for a lint selector, so the predicate asks whether one exists.
 */

const ROOT = process.cwd();
const WEIGHT_DECL = /font-\[var\(--font-weight-[a-z]+\)\]|font-(?:normal|medium|semibold|bold|light|black)(?![-\w])/;

/** Terminates an opening tag by brace depth — steps over multi-line tags and callback braces. */
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

/** Comments are stripped first so the doc block above, which quotes `<b>`, is not counted. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export interface BoldScan {
  /** Total `<b>`/`<strong>` scanned — the denominator of the idling guard. */
  total: number;
  /** Places with no weight declaration. */
  implicit: string[];
}

export function scanSource(rel: string, raw: string, acc: BoldScan): void {
  const src = stripComments(raw);
  for (const m of src.matchAll(/<(b|strong)\b/g)) {
    const tag = openingTag(src, m.index ?? 0);
    acc.total += 1;
    let effective = tag;
    // When referenced by name, e.g. `className={numeralClass}`, expand that constant one level.
    const ref = /className=\{`?\$?\{?([A-Za-z_][A-Za-z0-9_]*)\}?/.exec(tag);
    if (ref && !/font-/.test(tag)) {
      const decl = new RegExp(`(?:const|let)\\s+${ref[1]}\\s*=\\s*([\\s\\S]{0,600}?);`, 'm').exec(src);
      if (decl) effective += ' ' + decl[1];
    }
    if (!WEIGHT_DECL.test(effective)) {
      const line = src.slice(0, m.index).split('\n').length;
      acc.implicit.push(`${rel}:${line}`);
    }
  }
}

function scanRepo(): BoldScan {
  const acc: BoldScan = { total: 0, implicit: [] };
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
        continue;
      }
      if (!name.endsWith('.tsx') || name.includes('.test.')) continue;
      scanSource(path.relative(ROOT, p), readFileSync(p, 'utf8'), acc);
    }
  };
  for (const root of ['src', 'app']) walk(path.join(ROOT, root));
  return acc;
}

describe('<b>/<strong> state their weight', () => {
  const scan = scanRepo();

  it('the scan is not empty, since a gate over an empty set is no gate', () => {
    expect(scan.total).toBe(10);
  });

  it('<b>/<strong> without a weight declaration are 0, since the browser default 700 is outside the ramp', () => {
    expect(
      scan.implicit,
      'A `<b>`/`<strong>` without a weight renders at the browser default 700; the ramp is 510/560/650.\n' +
        'Emphasised numbers and figures take `font-[var(--font-weight-strong)]`; where emphasis is switched off, use `font-normal`.\n' +
        `Violations: ${scan.implicit.join(', ')}`,
    ).toEqual([]);
  });

  it('probe: the detector really catches (comment, constant reference, explicit declaration)', () => {
    const probe = (body: string): BoldScan => {
      const acc: BoldScan = { total: 0, implicit: [] };
      scanSource('probe.tsx', body, acc);
      return acc;
    };

    // Violation — no weight declared
    expect(probe('<b className="tabular-nums">1</b>').implicit).toEqual(['probe.tsx:1']);
    expect(probe('<strong>x</strong>').implicit).toEqual(['probe.tsx:1']);

    // Legitimate — token weight, and explicit removal
    expect(probe('<b className="font-[var(--font-weight-strong)]">1</b>').implicit).toEqual([]);
    expect(probe('<b className="font-normal tabular-nums">1</b>').implicit).toEqual([]);

    // Legitimate — referencing a constant by name still expands that constant
    const viaConst = probe(
      'const numeralClass = "font-mono font-[var(--font-weight-strong)] text-x";\n<b className={numeralClass}>1</b>',
    );
    expect(viaConst.implicit, 'if a constant reference cannot be expanded it cannot be told from a real violation').toEqual([]);
    // …and if that constant carries no weight it is still caught
    expect(probe('const c = "font-mono text-x";\n<b className={c}>1</b>').implicit).toEqual(['probe.tsx:2']);

    // A `<b>` inside a comment is not counted — this file's own doc-block produced a false positive in the first implementation
    expect(probe('// `<b>` 는 안 적으면 700 이다\nconst a = 1;').total).toBe(0);
    expect(probe('/* <strong>x</strong> */\nconst a = 1;').total).toBe(0);
  });
});
